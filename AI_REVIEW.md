# Code Review — `prax-dev` branch vs `origin/dev`

**Files reviewed**: 896 files, ~71,036 insertions, ~877 deletions  
**Scope**: Focused on source code changes (~50 files). Excluded ~700+ skill symlinks, icon assets, docs, and reference files.  
**Overall assessment**: **REQUEST_CHANGES**

---

## Findings

### P0 - Critical

(none)

### P1 - High

**1. `packages/opencode/src/server/routes/session.ts:1030` — Steer route has no session existence validation**

The `POST /:sessionID/steer` handler pushes messages into the steer queue without verifying the session actually exists. A fabricated or stale `sessionID` silently creates orphan state in memory and can trigger `SessionPrompt.loop()` on a non-existent session.

```typescript
// Current — no guard
async (c) => {
  const sessionID = c.req.valid("param").sessionID as SessionID
  const body = c.req.valid("json")
  const entry = SessionSteer.push(sessionID, body.text, body.mode)
  if (SessionStatus.get(sessionID).type === "idle") {
    SessionPrompt.loop({ sessionID }).catch(() => { ... })
  }
  return c.json(entry)
}
```

Suggested fix: Add a session-exists check (e.g., `Session.get(sessionID)`) and return 404 if not found, consistent with the other `/:sessionID/*` routes.

---

**2. `packages/opencode/src/session/steer.ts` — Unbounded memory growth: session entries never cleaned up**

The state is `Record<string, SteerState>` keyed by sessionID. Entries are created via `ensure()` but never deleted when a session ends, is archived, or is deleted. Over a long-running server with many sessions, this accumulates orphan objects indefinitely.

```typescript
const state = Instance.state(
  () => {
    const data: Record<string, SteerState> = {}  // grows forever
    return data
  },
  async () => {},
)
```

Suggested fix: Subscribe to `Session.Event.Deleted` / archive events and call `delete s[sessionID]` to reclaim memory. Alternatively, add a `destroy(sessionID)` function and call it from session lifecycle hooks.

---

**3. `packages/opencode/src/server/routes/experimental.ts:270-290` — Enhance route uses empty sentinel IDs**

The `/enhance` endpoint passes `"" as SessionID` and `"" as MessageID` to `LLM.stream()`. If any downstream code (logging, metrics, DB writes, bus events) indexes on these values, it will collide or produce corrupt records.

```typescript
user: {
  role: "user",
  id: "" as MessageID,         // ← empty sentinel
  sessionID: "" as SessionID,  // ← empty sentinel
  ...
}
```

Suggested fix: Generate a transient `MessageID.ascending()` and either a dedicated sentinel SessionID constant or a real ephemeral session. At minimum, use a namespaced prefix like `"enhance-"` so collisions are impossible.

---

**4. `packages/opencode/src/provider/provider.ts` — Bedrock context cap duplicated in two locations**

The identical `BEDROCK_CONTEXT_CAP` logic block (constant + condition + mutation) appears at both line ~816 and ~960. This violates DRY and risks divergence if only one copy is updated.

```typescript
// Appears TWICE, verbatim:
const BEDROCK_CONTEXT_CAP = 200_000
if (
  provider.id === "amazon-bedrock" &&
  m.limit.context > BEDROCK_CONTEXT_CAP &&
  m.id.includes("anthropic")
) {
  m.limit.context = BEDROCK_CONTEXT_CAP
}
```

Suggested fix: Extract to a shared helper function like `capBedrockContext(providerID, model)` and call it from both sites.

---

**5. `packages/opencode/src/session/prompt.ts:328-375` — Steer injection has no input length limit**

Steered/queued messages are concatenated with `\n\n` and injected as a new user message. There is no limit on the number of queued messages or their combined length. A client could push hundreds of large messages, creating an oversized user turn that blows the context window or causes OOM.

```typescript
const text = steered.map((m) => m.text).join("\n\n")  // unbounded
```

Suggested fix: Add a max queue depth (e.g., 20 messages) and/or a max combined text length in `SessionSteer.push()`. Reject with an error when exceeded.

---

### P2 - Medium

**6. `packages/opencode/src/session/processor.ts:372-383` — Thinking block error detection is string-match fragile**

The thinking block error recovery relies on substring matching against the error message:

```typescript
if (errorMsg.includes("thinking") && errorMsg.includes("cannot be modified")) {
```

If the API error message wording changes (e.g., "thought" instead of "thinking", or different phrasing), the recovery path silently breaks and falls through to the generic retry path. 

Suggested fix: Match on a structured error code if available, or use a more resilient regex. Add a log warning for unmatched thinking-related errors.

---

**7. `packages/opencode/src/server/routes/experimental.ts:296` — Think tag stripping regex can fail on malformed output**

```typescript
const cleaned = text.replace(/<think>[\s\S]*?<\/think>\s*/g, "").trim()
```

The non-greedy `*?` correctly handles single think blocks, but if the model outputs an unclosed `<think>` tag, the regex won't match and the raw think block leaks to the user.

Suggested fix: Add a fallback strip for unclosed `<think>` tags: `.replace(/<think>[\s\S]*$/g, "")`.

---

**8. `packages/opencode/src/config/config.ts` — Spread preserves stale thinking_strategy values**

```typescript
result.compaction = { ...result.compaction, auto: false, thinking_strategy: result.compaction?.thinking_strategy ?? "none" }
```

If `result.compaction` already has a `thinking_strategy` set, the explicit `?? "none"` fallback is dead code (it only activates when the field is undefined). The actual intent is unclear — is this preserving an existing value or defaulting? If preserving, `...result.compaction` already does that. The explicit re-assignment is redundant.

---

**9. `packages/desktop/src/console-bridge.ts` — Timer not cleaned up on teardown**

The batching timer is never cleared. When the Tauri webview is destroyed, the pending `setTimeout` callback can fire after the bridge is gone, potentially causing errors.

```typescript
if (!timer) timer = setTimeout(() => { timer = undefined; flush() }, 100)
```

Suggested fix: Export a `teardown()` function that calls `clearTimeout(timer)` and `flush()`, invoked on webview unload.

---

**10. Test files use source-code grep instead of behavioral testing**

`test/prax-features/enhance.test.ts`, `steer.test.ts`, and `mermaid.test.ts` read source files as strings and assert on pattern matches:

```typescript
const src = await Bun.file("src/session/steer.ts").text()
expect(src).toContain("export function push")
```

These tests verify that specific strings exist in source code, not that the code works. They are extremely brittle — any rename, reformat, or refactor breaks them without any actual regression. They provide no coverage of runtime behavior.

Suggested fix: Replace with unit tests that import the modules and test actual function behavior (several of these already exist in `test/session/steer.test.ts` which tests the real API correctly).

---

**11. `packages/desktop/src-tauri/tauri.conf.json` — Fork-specific branding change**

Product name changed from `"OpenCode Dev"` to `"OpenCode Prax-Dev"` and identifier from `ai.opencode.desktop.dev` to `ai.opencode.desktop.prax-dev`. Icon paths changed from `icons/dev/` to `icons/prax-dev/`. This is fork-specific and will conflict on merge to upstream `dev`.

---

### P3 - Low

**12. Agent symlink explosion (~500+ files)**

The PR adds symlinks in ~30 directories (`.adal/`, `.agent/`, `.augment/`, `.claude/`, `.codebuddy/`, `.commandcode/`, `.continue/`, `.cortex/`, `.crush/`, `.factory/`, `.goose/`, `.iflow/`, `.junie/`, `.kilocode/`, `.kiro/`, `.kode/`, `.mcpjam/`, `.mux/`, `.neovate/`, `.openhands/`, `.pi/`, `.pochi/`, `.qoder/`, `.qwen/`, `.roo/`, `.trae/`, `.vibe/`, `.windsurf/`, `.zencoder/`). These should ideally be generated at install-time rather than committed, or consolidated into fewer directories.

---

**13. `packages/opencode/src/session/processor.ts` — MAX_RETRIES should be configurable**

`MAX_RETRIES = 10` is hardcoded. For production debugging and different environments, this should be a config value or at least an environment variable override, consistent with how `DOOM_LOOP_THRESHOLD` works.

---

**14. `packages/app/src/components/prompt-input.tsx` — enhancePrompt error handling is toast-only**

The enhance feature catches errors and shows a toast, but silently swallows the response when the server returns the original text unchanged (fallback case). The user gets no feedback that enhancement failed or was a no-op.

---

## Removal/Iteration Plan

| Item | Action | Risk |
|------|--------|------|
| Source-grep test files (`prax-features/*.test.ts`) | Delete — real behavioral tests already exist in `test/session/steer.test.ts` | Safe delete now |
| `.bug-hunter/` directory | Delete or gitignore — analysis artifacts not needed in repo | Safe delete now |
| `star-team-audit/` directory | Delete or gitignore — audit artifacts not needed in repo | Safe delete now |
| `docs/09-temp/` files | Move to wiki or delete — temp planning docs should not ship | Safe after confirming no references |

## Additional Suggestions

- **SDK gen files** (`sdk/js/src/v2/gen/sdk.gen.ts`, `types.gen.ts`): The new steer routes are reflected in the generated SDK. Verify these were regenerated from the OpenAPI spec and not hand-edited.
- **Enhance agent temperature**: `temperature: 0.7` is reasonable for rewriting, but consider making it configurable per-user or documenting the choice.
- **Bedrock context cap**: The 200K cap is correct for current Bedrock limits, but should have a code comment linking to the AWS documentation for future maintainers.

---

## Next Steps

I found **14 issues** (P0: 0, P1: 5, P2: 6, P3: 3).

**How would you like to proceed?**

1. **Fix all** — I'll implement all suggested fixes
2. **Fix P1 only** — Address the 5 high-priority issues
3. **Fix specific items** — Tell me which issues to fix
4. **No changes** — Review complete, no implementation needed

Please choose an option or provide specific instructions.
