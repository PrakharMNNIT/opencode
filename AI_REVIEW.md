# Code Review — `prax-dev` vs `origin/dev`

> Generated: 2026-03-19T01:58Z
> Reviewer: code-review-expert skill
> Scope: `git diff origin/dev...HEAD` (core source files only)

## Code Review Summary

**Files reviewed**: ~60 core source files across `packages/opencode`, `packages/app`, `packages/desktop`, `packages/ui`
**Lines changed**: ~75,276 additions, ~4,470 deletions (997 total files; ~800 were skill symlinks, docs, icons, i18n — skipped)
**Overall assessment**: **COMMENT**

The branch contains a large, well-structured refactor that inlines separate service files into their parent namespaces (permission, auth, question, snapshot, skill), adds a new steer/queue feature for session management, improves compaction headroom logic, and adds desktop console log bridging. No merge-blocking security vulnerabilities found, but several high-priority items need attention.

---

## Findings

### P0 - Critical

(none)

---

### P1 - High

**1. [packages/opencode/src/session/steer.ts] Unbounded in-memory state — no session cleanup**

The `Instance.state()` call creates a `Record<string, SteerState>` that accumulates entries for every session. `drain()` empties the `pending` array but never deletes the session key. Over long-running processes with many sessions, this is a memory leak (ref: security-checklist § Runtime Risks — "Unbounded collections that grow without limit").

```typescript
// Current: drain clears array but key persists forever
function drain(sessionID: string): QueuedMessage[] {
  const entry = ensure(sessionID)
  const items = entry.pending.splice(0)
  // entry still exists in state()[sessionID]
  ...
}
```

- **Suggested fix**: After drain returns items, `delete state()[sessionID]` if the array is now empty. Or subscribe to a session-close bus event to evict stale entries.
- **Impact**: Memory exhaustion in long-running desktop/server processes.

---

**2. [packages/opencode/src/session/message-v2.ts] Removed `differentModel` guard — providerMetadata now always propagated**

The `differentModel` check was removed. Now `providerMetadata` and `callProviderMetadata` from model A (e.g., Anthropic thinking blocks, cache metadata) are always forwarded when replaying messages to model B (e.g., OpenAI, Bedrock). Provider-specific metadata sent to an incompatible provider may cause API errors or silent data corruption (ref: code-quality-checklist § Error Handling — "What happens when this operation fails?").

```typescript
// Before: metadata gated by model match
...(differentModel ? {} : { providerMetadata: part.metadata }),

// After: always passed through
providerMetadata: part.metadata,
```

- **Suggested fix**: Verify all downstream SDK providers tolerate unknown metadata keys gracefully (they may ignore or error). If not safe, restore a guard — but scope it to provider *family* change (e.g., `anthropic` → `openai`), not just model ID change.
- **Impact**: Potential API 400 errors when switching models mid-conversation.

---

**3. [packages/opencode/src/provider/auth.ts] OAuth `pending` Map has no TTL, size limit, or CSRF token**

`pending = new Map<ProviderID, AuthOuathResult>()` stores intermediate OAuth state after `authorize()` with no expiration. If `callback()` is never invoked, entries persist forever (ref: security-checklist § AuthN/AuthZ, Runtime Risks — "Missing timeouts on external calls", "Unbounded collections"). Additionally, no CSRF state parameter binds the authorize↔callback round-trip — any request with the right `providerID` can complete the flow.

```typescript
const pending = new Map<ProviderID, AuthOuathResult>()
// No TTL, no max size, no state/nonce token
```

- **Suggested fix**:
  1. Add a TTL (10 min) — wrap entries with a timestamp and sweep on access or via `setInterval`.
  2. Cap map size (e.g., 50 entries, evict oldest).
  3. Add a random `state` token to `authorize()` response and require it back in `callback()`.
- **Impact**: Stale entries leak memory; absent CSRF token is a low-severity security gap (local-only server mitigates exploitability).

---

**4. [packages/desktop/src/entry.tsx] Silent swallow of console-bridge import failure**

`.catch(() => {})` silently eats the error if `console-bridge` fails to load. The app proceeds with zero log forwarding and zero diagnostics (ref: code-quality-checklist § Error Handling — "Swallowed exceptions: empty catch blocks").

```typescript
import("./console-bridge")
  .catch(() => {})  // silent failure
  .then(() => { ... })
```

- **Suggested fix**: `.catch((e) => { console.error("[console-bridge] failed:", e) })`
- **Impact**: Silent loss of all webview→Rust log forwarding with no way to diagnose.

---

**5. [packages/opencode/src/provider/provider.ts] Hardcoded `BEDROCK_CONTEXT_CAP = 200_000`**

A magic number caps Bedrock Anthropic context to 200K. As Bedrock evolves (or users enable `context-1m` beta), this will silently under-utilize context (ref: solid-checklist § OCP — "Adding a new behavior requires editing many switch/if blocks", code-quality-checklist § "Magic numbers without named constants").

- **Suggested fix**: Make configurable via provider config schema (e.g., `provider.amazon-bedrock.contextLimit`). At minimum, add a TODO comment with the Bedrock docs link and the condition under which this should change.
- **Impact**: Users on Bedrock with 1M context enabled get silently capped at 200K.

---

### P2 - Medium

**6. [packages/opencode/src/session/compaction.ts] Default headroom changed from 20K to up-to-32K**

Removing `COMPACTION_BUFFER = 20_000` and using `ProviderTransform.maxOutputTokens()` (capped at `OUTPUT_TOKEN_MAX = 32_000`) changes compaction trigger behavior. Models that previously reserved 20K now reserve up to 32K, triggering compaction earlier. This is a user-visible behavioral change (ref: code-quality-checklist § Boundary Conditions).

- **Mitigated by**: Config override `config.compaction.reserved`. Comment references #12924.
- **Suggested action**: Document in release notes that compaction may trigger sooner for high-output models.

---

**7. [packages/desktop/src/console-bridge.ts] Batch array unbounded; no cleanup on unload**

The `batch: string[]` grows if `flush()` calls fail or get lost. No `beforeunload` handler ensures final flush. Under pathological conditions (rapid console spam + failing IPC), this is a memory concern (ref: code-quality-checklist § Memory — "Unbounded collections", security-checklist § Runtime Risks).

```typescript
let batch: string[] = []
// No max length, no unload flush
```

- **Suggested fix**:
  1. `if (batch.length > 500) batch.splice(0, batch.length - 500)` before push.
  2. `window.addEventListener("beforeunload", flush)`.

---

**8. [packages/opencode/src/provider/error.ts] Band-aid for `msg === "undefined"` string**

New check catches the string literal `"undefined"` — this means `undefined` is being coerced to string upstream. This is a symptom fix, not root cause (ref: code-quality-checklist § Error Handling — "Errors are logged with sufficient context").

- **Suggested fix**: Track down where the `undefined` → `"undefined"` coercion happens (likely a `.toString()` or template literal on an undefined var). Keep this guard as defense-in-depth.

---

**9. [packages/opencode/src/server/routes/experimental.ts] New steer/queue endpoints — verify auth boundary**

New experimental endpoints for steer queue CRUD (`push`, `remove`, `list`, `drain`). These routes must inherit the same auth/session-ownership middleware as existing session routes. The `remove` endpoint accepts `steerID` — confirm it cannot be used cross-session (ref: security-checklist § AuthN/AuthZ — "Missing tenant or ownership checks", "IDOR").

- **Suggested action**: Verify routes are registered under the authenticated router with session-scoped access control.

---

**10. [packages/opencode/src/session/steer.ts] Potential prototype pollution via session ID**

`ensure(sessionID)` does `s[sessionID]` on a plain object `{}`. If `sessionID` were user-controlled and equal to `"__proto__"` or `"constructor"`, this could pollute the prototype chain (ref: security-checklist § Input/Output Safety — "Prototype pollution: unsafe object merging"). Mitigated by session IDs being server-generated UUIDs, but not enforced at this layer.

- **Suggested fix**: Use `Object.create(null)` instead of `{}` for the state record, or use a `Map<string, SteerState>`.

---

**11. [packages/desktop/src-tauri/tauri.conf.json] Missing trailing newline**

POSIX convention; some CI linters flag this.

- **Suggested fix**: Re-add trailing newline.

---

### P3 - Low

**12. [packages/opencode/src/provider/auth.ts] Upstream typo `AuthOuathResult`**

Import `AuthOuathResult` (should be `AuthOauthResult`) comes from `@opencode-ai/plugin`. Not fixable in this PR — file upstream issue.

---

**13. [packages/app/src/components/prompt-input.tsx] Fire-and-forget `.catch(() => {})` on steer remove**

```typescript
sdk.client.session.steer2.remove({ sessionID, steerID: item.id }).catch(() => {})
```

Acceptable for UI feedback (the item is already visually removed), but consider logging the error at debug level for diagnosability.

---

**14. [packages/opencode/src/effect/instances.ts + runtime.ts] Clean namespace rename**

The `FooService` → `Foo` pattern and import consolidation from `/service` → `/index` is clean, consistent, and correctly reflected in all layer registrations. No issues.

---

**15. [packages/opencode/src/config/config.ts] New `thinking_strategy` and `plan_mode` experimental flags**

Good use of `z.enum(["none", "strip", "compact"]).optional().default("none")` with appropriate defaults. Properly scoped under experimental config.

---

**16. [packages/opencode/src/skill/skill.ts + discovery.ts] Large inlining**

Consistent with the permission/auth/question refactoring pattern. `skill.ts` grew by ~400 lines. Monitor for SRP violations as this file evolves — it now owns schemas, service interface, layer definition, scanning logic, and URL-based skill download (ref: solid-checklist § SRP — "File owns unrelated concerns").

---

## Removal/Iteration Plan

### Safe to Remove Now (confirmed in this PR)

| Item | Location | Evidence | Verified |
|------|----------|----------|----------|
| PermissionEffect service file | `src/permission/service.ts` | Fully inlined into `index.ts`; no external imports remain | ✅ |
| ProviderAuth service file | `src/provider/auth-service.ts` | Fully inlined into `auth.ts`; `instances.ts` updated | ✅ |
| Question service file | `src/question/service.ts` | Fully inlined into `index.ts`; `instances.ts` updated | ✅ |
| Eventloop util | `src/util/eventloop.ts` | Functionality consolidated; 0 imports | ✅ |

### Defer Removal (needs follow-up)

| Item | Location | Why Defer |
|------|----------|-----------|
| `BEDROCK_CONTEXT_CAP` hardcode | `provider/provider.ts` | Needs config schema addition; coordinate with Bedrock feature flag timeline |
| `session/prompt/qwen.txt` → `default.txt` rename | `session/prompt/` | Old `qwen.txt` may still be referenced in docs or configs — verify before deleting |

---

## SOLID Assessment

| Principle | Status | Notes |
|-----------|--------|-------|
| **SRP** | ⚠️ | `skill.ts` now owns scanning + downloading + layer + schemas. Monitor. |
| **OCP** | ✅ | Steer mode extensibility via `Mode = "queue" \| "steer"` enum is good. |
| **LSP** | ✅ | No inheritance patterns in changed code. |
| **ISP** | ✅ | Service interfaces are narrow and focused. |
| **DIP** | ✅ | Effect `Layer`/`ServiceMap` pattern properly inverts dependencies. |

---

## Areas Not Covered

- **Database migrations**: No migration files were changed; not reviewed.
- **UI component rendering**: CSS changes in `packages/ui` were skimmed, not deeply reviewed.
- **i18n/localization**: Translation files were not reviewed for completeness.
- **E2E test coverage**: New steer queue feature lacks E2E tests in the diff.
- **Skill content**: The ~800 skill symlinks and `.agents/` content were not reviewed for correctness.

---

## Next Steps

I found 16 issues (P0: 0, P1: 5, P2: 6, P3: 5).

**How would you like to proceed?**

1. **Fix all** — I'll implement all suggested fixes
2. **Fix P1 only** — Address the 5 high priority issues
3. **Fix specific items** — Tell me which issues to fix
4. **No changes** — Review complete, no implementation needed

Please choose an option or provide specific instructions.
