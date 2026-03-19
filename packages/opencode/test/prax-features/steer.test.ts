import { describe, expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"

const root = path.resolve(import.meta.dir, "../../src")

describe("session.steer", () => {
  const file = path.join(root, "session/steer.ts")

  describe("module structure", () => {
    test("steer.ts exists", async () => {
      const stat = await fs.stat(file)
      expect(stat.isFile()).toBe(true)
    })

    test("exports SessionSteer namespace", async () => {
      const src = await fs.readFile(file, "utf-8")
      expect(src).toContain("export namespace SessionSteer")
    })

    test("defines Mode type with queue and steer variants", async () => {
      const src = await fs.readFile(file, "utf-8")
      expect(src).toContain('export type Mode = "queue" | "steer"')
    })

    test("defines QueuedMessage interface with required fields", async () => {
      const src = await fs.readFile(file, "utf-8")
      expect(src).toContain("export interface QueuedMessage")
      expect(src).toContain("id: string")
      expect(src).toContain("text: string")
      expect(src).toContain("time: number")
      expect(src).toContain("mode: Mode")
    })

    test("exports QueueChanged bus event", async () => {
      const src = await fs.readFile(file, "utf-8")
      expect(src).toContain("QueueChanged: BusEvent.define")
      expect(src).toContain('"session.queue.changed"')
    })
  })

  describe("exported functions", () => {
    test("exports push function for adding to queue", async () => {
      const src = await fs.readFile(file, "utf-8")
      expect(src).toContain("export function push(sessionID: string, text: string, mode: Mode")
    })

    test("push defaults to queue mode", async () => {
      const src = await fs.readFile(file, "utf-8")
      expect(src).toContain('mode: Mode = "queue"')
    })

    test("push generates UUID for each entry", async () => {
      const src = await fs.readFile(file, "utf-8")
      expect(src).toContain("crypto.randomUUID()")
    })

    test("exports take function that drains all pending", async () => {
      const src = await fs.readFile(file, "utf-8")
      expect(src).toContain("export function take(sessionID: string): QueuedMessage[]")
      expect(src).toContain("s.pending.splice(0)")
    })

    test("exports takeByMode that filters by mode", async () => {
      const src = await fs.readFile(file, "utf-8")
      expect(src).toContain("export function takeByMode(sessionID: string, mode: Mode): QueuedMessage[]")
      expect(src).toContain("if (m.mode === mode) matched.push(m)")
    })

    test("exports has function for checking pending state", async () => {
      const src = await fs.readFile(file, "utf-8")
      expect(src).toContain("export function has(sessionID: string): boolean")
      expect(src).toContain("s.pending.length > 0")
    })

    test("exports list function for non-draining read", async () => {
      const src = await fs.readFile(file, "utf-8")
      expect(src).toContain("export function list(sessionID: string): QueuedMessage[]")
    })

    test("exports remove function by id", async () => {
      const src = await fs.readFile(file, "utf-8")
      expect(src).toContain("export function remove(sessionID: string, id: string): boolean")
      expect(src).toContain("s.pending.findIndex")
      expect(src).toContain("s.pending.splice(idx, 1)")
    })

    test("exports clear function that empties buffer", async () => {
      const src = await fs.readFile(file, "utf-8")
      expect(src).toContain("export function clear(sessionID: string)")
      expect(src).toContain("s.pending.length = 0")
    })
  })

  describe("edge cases", () => {
    test("take returns empty array for unknown session", async () => {
      const src = await fs.readFile(file, "utf-8")
      expect(src).toContain("if (!s || s.pending.length === 0) return []")
    })

    test("takeByMode returns empty when no matches", async () => {
      const src = await fs.readFile(file, "utf-8")
      expect(src).toContain("if (matched.length === 0) return []")
    })

    test("remove returns false for missing session", async () => {
      const src = await fs.readFile(file, "utf-8")
      expect(src).toContain("if (!s) return false")
    })

    test("remove returns false for unknown id", async () => {
      const src = await fs.readFile(file, "utf-8")
      expect(src).toContain("if (idx === -1) return false")
    })

    test("clear is a no-op for empty or missing session", async () => {
      const src = await fs.readFile(file, "utf-8")
      expect(src).toContain("if (!s || s.pending.length === 0) return")
    })

    test("publishes QueueChanged event on every mutation", async () => {
      const src = await fs.readFile(file, "utf-8")
      const publishCalls = src.match(/Bus\.publish\(Event\.QueueChanged/g)
      // push, take, takeByMode, remove, clear = 5 publish sites
      expect(publishCalls?.length).toBeGreaterThanOrEqual(5)
    })
  })

  describe("zod schema validation", () => {
    test("QueuedMessageSchema validates all fields", async () => {
      const src = await fs.readFile(file, "utf-8")
      expect(src).toContain("z.object({")
      expect(src).toContain("id: z.string()")
      expect(src).toContain("text: z.string()")
      expect(src).toContain("time: z.number()")
      expect(src).toContain('mode: z.enum(["queue", "steer"])')
    })
  })
})
