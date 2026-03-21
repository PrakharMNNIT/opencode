# Code Review — prax-dev vs origin/dev

**Date**: 2026-03-22
**Branch**: `prax-dev` vs `origin/dev`
**Files reviewed**: 141 source files across packages/app, packages/opencode, packages/desktop, packages/desktop-electron, packages/sdk
**Scope**: 6908 insertions, 328 deletions in feature code (skill mentions, steer/queue, enhance, settings, sync, TUI prompt, icons)
**Overall assessment**: **REQUEST_CHANGES**

---

## Findings

### P0 — Critical

1. **[packages/app/src/components/prompt-input.tsx:280]** Skill name not URL-encoded in API path
   - `fetch(\`${sdk.url}/session/${sessionID}/skill/${name}\`)` — if a skill name contains `/`, `..`, `?`, or `#` characters, the URL path is corrupted. A name like `../../experimental/enhance` would hit a different endpoint entirely.
   - Same issue at line 299 with `${sdk.url}/experimental/enhance` (lower risk since path is hardcoded, but `sessionID` from `params.id` is also unencoded).
   - **Fix**: `encodeURIComponent(name)` and `encodeURIComponent(sessionID)` in both `skillApi()` and `enhancePrompt()`.

### P1 — High

2. **[packages/app/src/components/prompt-input.tsx:280]** `skillApi` `.catch(() => {})` silently swallows all errors
   - Network failures, 500s, auth errors, and malformed responses are all invisible. The inline comment says "badge strip will re-sync from server" but re-sync doesn't help the user understand *why* a skill wasn't added. The toast added for removal errors (commit b8f5b4c) only covers the badge × click path in the old code, not the current unified `skillApi` helper.
   - **Fix**: At minimum `console.warn`. Ideally show a toast on non-2xx responses (matching the pattern already used elsewhere in this file).

3. **[packages/opencode/src/server/routes/session.ts:1115–1165]** Skill routes don't validate session existence
   - `POST/GET/DELETE /:sessionID/skill` skip `Session.get(sessionID)` — a POST with a fabricated session ID inserts a row into `session_skills` that references nothing. The code comment says "let prompt.ts catch nonexistent skills" but that's about skill *name* validation, not session ID validation. Garbage session IDs accumulate in the DB.
   - **Fix**: Add `const session = await Session.get(sessionID); if (!session) return c.json(null, 404)` at the top of each skill handler (consistent with how steer routes implicitly validate via `SessionStatus.get`).

4. **[packages/opencode/src/server/routes/session.ts:1160]** Skill name accepted without existence check
   - The `POST /:sessionID/skill` handler persists any string as a skill name. Invalid names like `nonexistent-skill-xyz` sit in the DB and are silently skipped during prompt injection (`Skill.get()` returns null → `log.warn` → skip). The user sees a badge for a skill that does nothing.
   - **Fix**: Validate the skill exists via `Skill.available()` or equivalent before persisting. Return 404 if the skill name is unknown.

5. **[packages/app/src/util/skill-parse.ts:14]** Module-level `/g` regex `SKILL_STRIP` never has `lastIndex` reset
   - `SKILL_PATTERN` (line 13) gets `lastIndex = 0` after use (line 26), but `SKILL_STRIP` (line 14) does not. Both are module-level regexes with the `/g` flag. After calling `parseSkills()`, `SKILL_STRIP.lastIndex` retains stale state. If `parseSkills` is called again on shorter input, `.replace()` with a global regex creates a new iteration context so this is currently safe — but the asymmetry is a latent bug. If `SKILL_STRIP` is ever used in an `exec()` loop elsewhere, it will skip matches.
   - **Fix**: Either reset `SKILL_STRIP.lastIndex = 0` after use (for symmetry), or create the regex inside the function body to avoid shared mutable state entirely.

6. **[packages/app/src/components/prompt-input.tsx]** SRP violation — 1944-line component
   - This single component handles: text editing, file attachments, skill mentions, skill badges, steer/queue, enhance prompt, slash commands, keyboard shortcuts, popover management, submit logic, and demo mode. The branch adds ~466 lines for skills + steer + enhance, pushing it well past any reasonable single-component threshold.
   - **Impact**: High merge-conflict risk, near-impossible to unit test individual features, any future contributor touching this file risks regressions in unrelated features.
   - **Fix (incremental)**: Extract `skill-badges.tsx` (badge strip + API calls), `steer-queue.tsx` (steer UI), `enhance.tsx` (enhance button + fetch). Each is a self-contained feature area with clear boundaries.

### P2 — Medium

7. **[packages/app/src/components/prompt-input.tsx:273–285]** Auth header construction duplicated
   - The pattern `if (server.current?.http?.password) { headers.Authorization = \`Basic ${btoa(...)}\` }` appears identically in `skillApi()` (line 277) and `enhancePrompt()` (line 300). Both also duplicate `const fetcher = platform.fetch ?? fetch`.
   - **Fix**: Extract `authHeaders()` helper and `fetcher()` once at the component level or in a shared utility.

8. **[packages/app/src/components/prompt-input.tsx:575, 1732]** `innerHTML = ""` used to clear editor
   - Two occurrences of `editorRef.innerHTML = ""`. While the input is not user-controlled here (it's a clear operation), this establishes a mutation pattern. If future code passes user content through `innerHTML`, it's an XSS vector.
   - **Fix**: Use `editorRef.replaceChildren()` or `editorRef.textContent = ""`.

9. **[packages/app/src/prax-features.test.ts + packages/app/src/context/prax-features.test.ts]** Duplicate test file locations
   - Both files are new in this branch. `prax-features.test.ts` at root `src/` is 14819 bytes (414 lines), the one in `context/` is 3691 bytes (125 lines). Both test prax feature logic — unclear which is canonical.
   - **Fix**: Consolidate to one location. If they test different things, rename to distinguish purpose.

10. **[packages/opencode/src/session/skill.service.ts]** In-memory state not resilient to process restart mid-session
    - `SessionSkills` uses `Instance.state()` (in-memory Map) as the primary read source, with SQL as the persistence layer. On process restart, skills are rehydrated from SQL in `ensureLoaded()`. This is correct, but `ensureLoaded()` is only called in `list()` — if `add()` or `remove()` is called before any `list()`, the in-memory state may not reflect what's in SQL.
    - **Impact**: Low — the frontend always calls `list()` on session load, which triggers hydration. But the code structure assumes call ordering.
    - **Fix**: Call `ensureLoaded(sessionID)` at the top of `add()` and `remove()` as well, or document the invariant.

### P3 — Low

11. **[packages/app/src/components/prompt-input.tsx:287–288]** `steerPending` / `enhancing` — multi-word signal names
    - Per project style guide: "Prefer single word variable names where possible." `steerPending` → `steering`, `enhancing` is already fine (single concept).
    - **Fix**: Rename `steerPending` → `steering` (or `queuing`).

12. **[packages/app/src/util/skill-parse.ts:20]** `let m` without type annotation
    - Minor — `let m: RegExpExecArray | null` would make the type explicit. Style nit only.

13. **[packages/opencode/src/session/skill.service.ts]** Comment block is 20+ lines of ASCII art architecture diagram
    - Valuable for understanding but heavyweight for a ~230-line service file. Consider moving to the design doc (`docs/designs/dollar-skill-mentions.md`) and keeping a one-liner reference in the source.

---

## SOLID & Architecture Assessment

| Principle | Status | Notes |
|-----------|--------|-------|
| **SRP** | ⚠️ P1 #6 | `prompt-input.tsx` now owns 6+ unrelated feature areas (1944 lines). |
| **OCP** | ✅ Pass | Skill system extends via new routes + events without modifying existing code. |
| **LSP** | N/A | No inheritance hierarchies affected. |
| **ISP** | ✅ Pass | `SessionSkills` exposes narrow `add/remove/list` interface. Skill routes are focused. |
| **DIP** | ⚠️ P2 #7 | `prompt-input.tsx` directly constructs auth headers + fetch calls instead of depending on SDK client abstractions. |

---

## Security & Reliability Assessment

| Category | Status | Notes |
|----------|--------|-------|
| Path Traversal | ❌ P0 #1 | Unencoded skill name/session ID in URL path construction |
| Error Handling | ⚠️ P1 #2 | Silent `.catch(() => {})` on skill API calls |
| Data Integrity | ⚠️ P1 #3,4 | No session existence or skill name validation on server |
| XSS / Injection | ⚠️ P2 #8 | `innerHTML = ""` pattern (low risk currently, latent vector) |
| AuthN/AuthZ | ✅ Pass | Auth headers correctly applied; server validates session access |
| Secrets / PII | ✅ Pass | No secrets or PII in diff |
| Race Conditions | ✅ Pass | Skill add is idempotent; steer queue is append-only |
| Resource Exhaustion | ✅ Pass | Skill content loaded lazily by server, not stored in full on client |

---

## Code Quality Assessment

| Category | Status | Notes |
|----------|--------|-------|
| Error Handling | ⚠️ P1 #2 | Silent swallow on fetch errors |
| Performance | ✅ Pass | No N+1 queries; skill injection is O(n) where n = active skills |
| Boundary Conditions | ⚠️ P1 #5 | Stale `/g` regex state on `SKILL_STRIP` |
| Null Handling | ✅ Pass | Skill.get() → null handled gracefully server-side |
| Type Safety | ✅ Pass | Generated SDK types are consistent; hand-written code uses proper guards |
| Duplication | ⚠️ P2 #7,9 | Auth header construction × 2; duplicate test files |

---

## Removal/Iteration Plan

| Item | Status | Action |
|------|--------|--------|
| Duplicate test file `prax-features.test.ts` | Active | Consolidate to one location |
| Auth header duplication | Active | Extract shared utility |

---

## Additional Suggestions

- **Test coverage**: The 18 skill-parse unit tests are solid. Consider adding an integration test for the full skill→API→sync→badge pipeline (POST skill, verify SSE event, verify badge renders).
- **SDK client usage**: `skillApi()` and `enhancePrompt()` bypass the generated SDK client and use raw `fetch`. If the SDK already has these methods (`sdk.client.session.skill.*`), prefer them for type safety and consistent error handling.
- **Generated SDK files**: Verify `types.gen.ts` and `sdk.gen.ts` match a clean regeneration from the current OpenAPI spec (`./packages/sdk/js/script/build.ts`). No manual `.gen.ts` edits should be present.

---

## Corrections from Previous Review Draft

The prior draft (in git) contained findings that were **inaccurate or out of scope**:
- **P0 #1–3 (ipc.ts)**: `packages/desktop-electron/src/main/ipc.ts` has **zero changes** in this branch (`git diff` is empty). The `open-path`, `open-link`, and `store-*` handler issues are pre-existing, not introduced here.
- **P1 #7 (8 createSignal calls)**: The file has **4** `createSignal` calls, not 8. Only 2 were added by this branch (`steerPending`, `enhancing`). The existing `createStore` handles the main component state correctly.
- **P1 #8 (settings-general.tsx optimistic race)**: The settings changes in this branch are minor additions (new config fields), not changes to the update mechanism. Race condition claim was unverified.
- **P2 #12 (SSE reconnect backoff)**: `global-sync.tsx` changes are about wrapping event handling in `batch()`. There is **no** reconnection logic in this diff. `sync.tsx` uses a `retry()` utility which is also pre-existing.

---

## Next Steps

**13 verified issues** found (P0: **1**, P1: **4**, P2: **4**, P3: **3**, plus 1 borderline P1 on SRP).

**How would you like to proceed?**

1. **Fix P0/P1 only** — URL-encode skill paths, add error handling to `skillApi`, add session/skill validation on server, fix regex state
2. **Fix all** — Implement all suggested fixes including extractions and renames
3. **Fix specific items** — Tell me which issues to fix
4. **No changes** — Review complete, no implementation needed
