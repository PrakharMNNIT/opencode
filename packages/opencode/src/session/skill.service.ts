// SessionSkills — Server-side persistence for user-initiated $skill mentions.
//
// This service manages the lifecycle of skills that users explicitly load
// via the "$" prefix (e.g., typing "$brainstorming" in the prompt).
// It is the server-side counterpart to the frontend badge strip + popover.
//
// Architecture diagram:
//
//   Frontend                          Backend
//   ┌──────────┐                    ┌──────────────────────┐
//   │ $ popover│──POST /skill──────▶│ SessionSkills.add()  │
//   │ × badge  │──DELETE /skill────▶│ SessionSkills.remove()│
//   │ badge    │◀──sync channel─────│ SessionSkills.list() │
//   └──────────┘                    └──────────┬───────────┘
//                                              │
//                                   ┌──────────▼───────────┐
//                                   │ session_skills table  │
//                                   │ (SQLite, persists     │
//                                   │  across page reloads) │
//                                   └──────────────────────┘
//
// The prompt loop (prompt.ts) calls list() each message, then uses the
// LRU cache (SkillContentCache below) to avoid re-reading SKILL.md files
// from disk on every message.
//
// Design decisions (from CEO/Eng/Design reviews, 2026-03-19):
//   - Server-side persistence (Approach B) — survives page reloads
//   - In-memory LRU cache with 5-min TTL — fast after first load
//   - Idempotent add — adding a skill that's already active is a no-op
//   - $-removal only removes user-added skills, not AI auto-loaded ones
//   - Bus event on change → sync channel → frontend badge strip updates

import { Bus } from "../bus"
import { BusEvent } from "../bus/bus-event"
import { Database, eq, and } from "@/storage/db"
import { SessionSkillTable } from "./session.sql"
import { Log } from "../util/log"
import z from "zod"
import type { SessionID } from "./schema"

// ─── LRU Cache for Skill Content ───────────────────────────────────────────
//
// Avoids re-reading SKILL.md from disk on every message in a session.
// Keyed by skill name (global, not per-session — content is the same).
// TTL of 5 minutes handles the case where a user edits a SKILL.md mid-session.
//
//   cache.get("brainstorming")
//     → hit: return cached content (if not expired)
//     → miss/expired: return undefined → caller reads from disk → cache.set()

const CACHE_TTL = 5 * 60 * 1000 // 5 minutes in milliseconds

interface CacheEntry {
  content: string
  tokens: number // estimated token count (chars ÷ 4)
  time: number   // timestamp when cached
}

// In-memory LRU cache for skill content.
// Using a simple Map — entries are evicted by TTL, not by count,
// because the number of unique skills is small (typically <50).
const cache = new Map<string, CacheEntry>()

export namespace SkillContentCache {
  /** Get cached skill content. Returns undefined if miss or expired. */
  export function get(name: string): CacheEntry | undefined {
    const entry = cache.get(name)
    if (!entry) return undefined
    if (Date.now() - entry.time > CACHE_TTL) {
      // TTL expired — evict and return miss
      cache.delete(name)
      return undefined
    }
    return entry
  }

  /** Cache skill content with estimated token count. */
  export function set(name: string, content: string) {
    const tokens = Math.ceil(content.length / 4)
    cache.set(name, { content, tokens, time: Date.now() })
  }

  /** Evict a specific skill from cache (e.g., when removed from session). */
  export function evict(name: string) {
    cache.delete(name)
  }

  /** Clear entire cache (e.g., on session end). */
  export function clear() {
    cache.clear()
  }

  /** Get estimated token count for a cached skill. Returns 0 if not cached. */
  export function tokens(name: string): number {
    return get(name)?.tokens ?? 0
  }
}

// ─── SessionSkills Service ─────────────────────────────────────────────────

export namespace SessionSkills {
  const log = Log.create({ service: "session.skills" })

  // Bus event published when the skill list changes for a session.
  // The frontend reads this via sync channel to update the badge strip.
  export const Event = {
    Changed: BusEvent.define(
      "session.skill.changed",
      z.object({
        sessionID: z.string(),
        skills: z.array(z.object({
          name: z.string(),
          added_at: z.number(),
          token_estimate: z.number().nullable(),
        })),
      }),
    ),
  }

  export interface ActiveSkill {
    name: string
    added_at: number
    token_estimate: number | null
  }

  /** Add a skill to a session. Idempotent — re-adding is a no-op. */
  export function add(sessionID: SessionID, name: string, tokens?: number) {
    const now = Date.now()
    try {
      Database.use((db) =>
        db
          .insert(SessionSkillTable)
          .values({
            session_id: sessionID,
            skill_name: name,
            added_at: now,
            token_estimate: tokens ?? null,
          })
          .onConflictDoNothing()
          .run(),
      )
      log.info("skill.add", { sessionID, name })
    } catch (err) {
      log.error("skill.add.failed", { sessionID, name, error: String(err) })
      throw err
    }
    // Publish change event so frontend badge strip updates
    Bus.publish(Event.Changed, { sessionID, skills: list(sessionID) })
  }

  /** Remove a skill from a session. Returns true if it existed. */
  export function remove(sessionID: SessionID, name: string): boolean {
    // Check if the skill exists before deleting, since Drizzle's .run()
    // returns void and doesn't report affected row count.
    const before = list(sessionID)
    const existed = before.some((s) => s.name === name)
    if (!existed) return false
    // Delete using composite key: both session_id AND skill_name must match.
    Database.use((db) =>
      db
        .delete(SessionSkillTable)
        .where(
          and(
            eq(SessionSkillTable.session_id, sessionID),
            eq(SessionSkillTable.skill_name, name),
          ),
        )
        .run(),
    )
    log.info("skill.remove", { sessionID, name })
    SkillContentCache.evict(name)
    Bus.publish(Event.Changed, { sessionID, skills: list(sessionID) })
    return true
  }

  /** List all active skills for a session. */
  export function list(sessionID: SessionID): ActiveSkill[] {
    return Database.use((db) =>
      db
        .select({
          name: SessionSkillTable.skill_name,
          added_at: SessionSkillTable.added_at,
          token_estimate: SessionSkillTable.token_estimate,
        })
        .from(SessionSkillTable)
        .where(eq(SessionSkillTable.session_id, sessionID))
        .all(),
    )
  }

  /** Clear all active skills for a session. */
  export function clear(sessionID: SessionID) {
    Database.use((db) =>
      db
        .delete(SessionSkillTable)
        .where(eq(SessionSkillTable.session_id, sessionID))
        .run(),
    )
    log.info("skill.clear", { sessionID })
    Bus.publish(Event.Changed, { sessionID, skills: [] })
  }

  /** Get recent skill names across all sessions (for "Recent" popover section). */
  export function recent(limit = 5): string[] {
    const rows = Database.use((db) =>
      db
        .select({ name: SessionSkillTable.skill_name })
        .from(SessionSkillTable)
        .orderBy(SessionSkillTable.added_at)
        .all(),
    )
    // Deduplicate and take last N unique names
    const seen = new Set<string>()
    const result: string[] = []
    for (let i = rows.length - 1; i >= 0; i--) {
      if (!seen.has(rows[i].name)) {
        seen.add(rows[i].name)
        result.push(rows[i].name)
        if (result.length >= limit) break
      }
    }
    return result
  }

  /** Estimate total token budget for active skills in a session. */
  export function budget(sessionID: SessionID): number {
    const skills = list(sessionID)
    return skills.reduce((sum, s) => sum + (s.token_estimate ?? 0), 0)
  }
}
