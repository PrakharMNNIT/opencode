# Steer & Queue Bug Fix Plan

**Date:** 2026-03-06
**Branch:** prax-dev
**Scope:** 6 bugs — 1 settings crash + 5 critical steer/queue issues

---

## Bug Summary

| # | Bug | Severity | File(s) |
|---|-----|----------|---------|
| 1 | Settings page crashes: `useSDK()` outside SDK context | crash | `settings-general.tsx` |
| 2 | Steer does NOT inject mid-turn — behaves same as queue | critical | `prompt.ts` (backend loop) |
| 3 | Images/context silently dropped when queueing/steering | critical | `prompt-input.tsx`, `submit.ts` |
| 4 | Images-only submit while working bypasses queue, never gets response | critical | `prompt-input.tsx`, `submit.ts` |
| 5 | Double-submit: no debouncing on queue/steer paths | critical | `prompt-input.tsx`, `submit.ts` |
| 6 | Race condition: queue items stranded when AI finishes mid-request | moderate | `prompt-input.tsx` (frontend effect) |

---

## Bug 1: Settings crash — SDK context provider

### Root Cause

`SettingsGeneral` (settings-general.tsx:317) calls `useSDK()`, but the settings dialog
is rendered via Kobalte's portal system which mounts content in `<body>` — outside the
`SDKProvider` that lives in `directory-layout.tsx`. Portal content doesn't inherit
SolidJS context from the render tree.

Other settings components (e.g., `SettingsProviders`) correctly use `useGlobalSDK()` which
wraps the entire app at `app.tsx:153`.

### Fix

**File:** `packages/app/src/components/settings-general.tsx`

- Change `import { useSDK } from "@/context/sdk"` → `import { useGlobalSDK } from "@/context/global-sdk"`
- Change `const sdk = useSDK()` (line 317) → `const sdk = useGlobalSDK()`
- Everything else (sdk.client.config.get/update) works identically — `GlobalSDK` exposes the same `.client` interface

### Risk: None

`config.get()` and `config.update()` are global operations (not directory-scoped), so the global SDK client is semantically correct.

---

## Bug 2: Steer does NOT inject mid-turn

### Root Cause

The prompt loop in `prompt.ts` only checks for steer items when:
```typescript
if (lastAssistant?.finish && !["tool-calls", "unknown"].includes(lastAssistant.finish) && ...)
```

When `finish === "tool-calls"` (AI stopped between tool-call rounds), this entire block
is **skipped**. The loop falls through to `step++` which runs AI inference again. Steer
items sit idle until the AI fully finishes with a non-tool-calls reason — same behavior
as queue. The distinction between steer and queue is illusory.

### Fix

**File:** `packages/opencode/src/session/prompt.ts`

Add a steer check right before `step++` (line 380), specifically for the `tool-calls` case:

```typescript
// After the existing finish-check block (lines 321-378), before step++:

// Mid-turn steer injection: when AI paused for tool calls,
// check for steer messages and inject them so the AI sees
// the user's guidance alongside tool results in the next step.
if (
  lastAssistant?.finish === "tool-calls" &&
  lastUser.id < lastAssistant.id
) {
  const steered = SessionSteer.takeByMode(sessionID, "steer")
  if (steered.length > 0) {
    log.info("steer: mid-turn inject between tool calls", {
      sessionID,
      count: steered.length,
    })
    const text = steered.map((m) => m.text).join("\n\n")
    const steerMsg: MessageV2.User = {
      id: Identifier.ascending("message"),
      sessionID,
      role: "user",
      time: { created: Date.now() },
      agent: lastUser.agent,
      model: lastUser.model,
    }
    await Session.updateMessage(steerMsg)
    await Session.updatePart({
      id: Identifier.ascending("part"),
      messageID: steerMsg.id,
      sessionID,
      type: "text",
      text,
    } satisfies MessageV2.TextPart)
    // Fall through to step++ — the next AI inference sees:
    // [history] → [assistant tool calls] → [tool results] → [steer user msg]
  }
}

step++
```

**Why this works:**
- The AI already executed its tool calls (results are stored)
- The steer message becomes a new user message in the conversation
- On the next inference step, the AI sees: original conversation + tool results + steer guidance
- The AI responds considering both the tool results and the user's steer instruction
- Queue items are NOT consumed here — they still wait for the full turn to end

**Why no `continue`:**
We want the loop to proceed to `step++` regardless. The steer message is injected as
additional context, not as a replacement for the current step. The AI processes everything.

### Risk: Low

The steer message is just a user message inserted into the conversation. The AI model
handles multi-turn conversations natively. The only edge case is if the steer message
contradicts the tool results, but that's user intent — they explicitly steered.

---

## Bug 3: Images/context dropped silently when queueing/steering

### Root Cause

All 4 steer/queue paths (keyboard Enter, keyboard Shift+Enter, steer button, submit button)
extract only `type === "text"` parts, send only the text to the steer API, then call
`prompt.reset()` which wipes **everything** — images, @file mentions, @agent pills, comments.

User attaches image + types text + presses Enter while working → text queued, image gone, no warning.

### Fix

**Files:** `prompt-input.tsx`, `submit.ts`

When queueing/steering and there are non-text attachments present, show a warning toast
and preserve the attachments (only clear the text, not the whole prompt).

In each of the 4 paths, replace:
```typescript
prompt.reset()
const editor = editorRef
if (editor) editor.innerHTML = ""
```

With:
```typescript
// Check if there are non-text parts that would be lost
const hasAttachments = prompt.current().some((p) => p.type !== "text")
if (hasAttachments) {
  // Only clear text parts, preserve images/files/agents
  prompt.clearText()
  const editor = editorRef ?? input.editor()
  if (editor) editor.innerHTML = ""
  showToast({
    title: "Attachments kept",
    description: "Only text was queued — images and files are still attached",
  })
} else {
  prompt.reset()
  const editor = editorRef ?? input.editor()
  if (editor) editor.innerHTML = ""
}
```

**Prerequisite:** Check if `prompt.clearText()` exists. If not, we need to add it to
the prompt context, or simply filter and re-set:
```typescript
const nonTextParts = prompt.current().filter((p) => p.type !== "text")
if (nonTextParts.length > 0) {
  prompt.set(nonTextParts, 0)
  // show toast
} else {
  prompt.reset()
}
```

### Risk: Low

This is purely additive UX — preserves data instead of destroying it. The only concern
is whether `prompt.set()` with non-text-only parts renders correctly in the editor.

---

## Bug 4: Images-only submit while working — bypasses queue, never gets response

### Root Cause

When working + images-only (no text):
1. Enter key: `prompt.dirty()` true → enters queue check → `text` empty → falls through → `handleSubmit()`
2. `handleSubmit`: `images.length > 0` → passes empty check → `textOnly` empty → falls through
3. Proceeds to `client.session.promptAsync()` — sends a new prompt to a busy session
4. Backend `start()` returns undefined (loop already running), prompt joins callback queue
5. The callback resolves when current loop finishes, but the loop doesn't process this prompt
6. Message is orphaned

### Fix

**Files:** `prompt-input.tsx`, `submit.ts`

In `handleSubmit` (submit.ts), after the queue-when-working block, add a guard for the
working state:

```typescript
// After the queue-when-working block (lines 141-168):
// If still working and we didn't queue (e.g., image-only), block submission
if (input.working() && params.id) {
  showToast({
    title: language.t("prompt.action.waitForModel") ?? "Wait for model to finish",
    description: language.t("prompt.action.waitForModel.description")
      ?? "Images and files can't be queued — send after the model finishes",
  })
  return
}
```

In the Enter keyboard handler (prompt-input.tsx), add the same guard after the queue check
falls through:

```typescript
if (working() && params.id && store.mode !== "shell") {
  // existing queue path...
  if (text) { /* queue */ return }
  // NEW: if we got here, there's content but no text — block
  if (prompt.dirty()) {
    showToast({ title: "Wait for model to finish", description: "..." })
    event.preventDefault()
    return
  }
}
```

### Risk: None

Blocks an action that was already broken (orphaned message). The toast gives clear guidance.

---

## Bug 5: Double-submit — no debouncing

### Root Cause

`prompt.reset()` is called inside the `.then()` callback of the async steer API call.
Between the first Enter press and `.then()` resolving, a second Enter fires with the same
text → same message queued twice. Same issue with the steer button click handler.

### Fix

**Files:** `prompt-input.tsx`, `submit.ts`

Add a reactive signal to prevent re-entry:

```typescript
// In prompt-input.tsx, near steerQueue definition:
const [steerPending, setSteerPending] = createSignal(false)
```

In each steer/queue path, wrap the API call:
```typescript
if (steerPending()) return  // already in flight
setSteerPending(true)
sdk.client.session.steer(...)
  .then((res) => { /* existing logic */ })
  .catch((err) => { /* existing logic */ })
  .finally(() => setSteerPending(false))
```

For `handleSubmit` in submit.ts, use the same signal passed as an input accessor:
```typescript
type PromptSubmitInput = {
  // ... existing fields
  steerPending: Accessor<boolean>
  setSteerPending: (v: boolean) => void
}
```

### Risk: None

Standard debounce pattern. The signal is cleared in `.finally()` so it always resets.

---

## Bug 6: Race condition — queue items stranded when AI finishes mid-request

### Root Cause

Narrow timing window:
1. Frontend: `working()` true → sends steer API call (async)
2. Backend: prompt loop finishes, calls `cancel()` which does NOT clear queue yet
3. Backend: cancel → `SessionSteer.clear()` → clears queue
4. Backend: steer API arrives → pushes to queue → but loop already exited
5. Queue item sits in memory with no loop to process it

### Fix

**File:** `packages/opencode/src/server/routes/session.ts`

After pushing a queue-mode item, check if the session is idle. If so, kick off a new
prompt loop to process it:

```typescript
// In the POST /:sessionID/steer handler (line 976-981):
async (c) => {
  const sessionID = c.req.valid("param").sessionID
  const body = c.req.valid("json")
  const entry = SessionSteer.push(sessionID, body.text, body.mode)

  // If session is idle after push, auto-start a loop to process queue items.
  // This handles the race condition where the loop exits just before the push.
  if (body.mode === "queue" && SessionStatus.get(sessionID).type === "idle") {
    SessionPrompt.loop({ sessionID, resume_existing: false }).catch(() => {
      // If loop fails (e.g., no messages), clear the stranded item
      SessionSteer.clear(sessionID)
    })
  }

  return c.json(entry)
}
```

**Why `resume_existing: false`:** The loop already exited, so there's no existing loop
state to resume. `start()` creates a new loop entry.

**Why only for `queue` mode:** Steer items only make sense mid-turn. If the turn is over
and a steer item was pushed, treating it as queue (auto-submit) is the right fallback.
The new loop will consume both steer and queue items at the first iteration's finish check.

### Risk: Low

The `loop()` function is designed to be called multiple times — `start()` returns
undefined if a loop is already running. The `.catch()` cleans up stranded items.

---

## Implementation Order

1. **Bug 1** (Settings) — Standalone, zero risk, fixes crash
2. **Bug 2** (Steer mid-turn) — Backend only, core feature fix
3. **Bug 5** (Double-submit) — Small, defensive, unblocks bugs 3-4
4. **Bug 3** (Dropped attachments) — Depends on debounce being in place
5. **Bug 4** (Images-only block) — Builds on attachment awareness
6. **Bug 6** (Race condition) — Backend route change, low risk

---

## Files Modified

| File | Bugs Fixed |
|------|-----------|
| `packages/app/src/components/settings-general.tsx` | #1 |
| `packages/opencode/src/session/prompt.ts` | #2 |
| `packages/opencode/src/server/routes/session.ts` | #6 |
| `packages/app/src/components/prompt-input.tsx` | #3, #4, #5 |
| `packages/app/src/components/prompt-input/submit.ts` | #3, #4, #5 |

---

## Deep Dive: Priority, Ordering & Multi-Item Edge Cases

### How the queue actually works

The backend stores ALL items (steer + queue) in a **single chronological array**:

```
pending: [steer1(t=1), queue1(t=2), steer2(t=3), queue2(t=4)]
```

`takeByMode("steer")` partitions by mode, returning `[steer1, steer2]` and leaving
`[queue1, queue2]`. **Within** each mode, chronological order is preserved. **Between**
modes, the interleaving is lost.

### The ordering violation scenario

```
Push order:  queue1("do A") → steer1("cancel A, do B instead")
             t=1               t=2

Processing:  steer1 fires first (mid-turn) → "cancel A, do B instead"
             queue1 fires next (end-turn) → "do A"
```

The user intended steer1 to cancel queue1, but both fire independently because `takeByMode`
separates them into different processing phases. The AI processes "cancel A, do B" mid-turn,
then sees "do A" as a fresh instruction at turn end.

**Why this is acceptable:**
1. The two modes operate in **different timeframes** — steer is mid-turn guidance, queue is
   next-turn work. They're not meant to interact.
2. The UI shows all pending items with X buttons — the user sees both and can remove queue1.
3. The alternative (process items one-at-a-time in chronological order) would mean 5 queued
   items = 5 full AI turns. Unacceptably slow.
4. This scenario requires the user to push items of DIFFERENT modes in rapid succession,
   which is rare.

**Decision: Keep `takeByMode` approach. Document the behavior.**

---

### Scenario matrix: Every multi-item permutation

#### A. Multiple steers, no queues

```
pending: [steer1("focus on X"), steer2("also avoid Y")]
```

**At tool-call boundary (Bug #2 fix):**
- `takeByMode("steer")` → `[steer1, steer2]`
- Concatenated: `"focus on X\n\navoid Y"`
- Injected as single user message before next AI step
- AI sees combined guidance for current step

**Correct behavior.** Both are guidance for the same step. Concatenation preserves
chronological order. If steer2 contradicts steer1, the AI handles it (sees both).

#### B. Multiple queues, no steers

```
pending: [queue1("fix login"), queue2("update tests"), queue3("add errors")]
```

**At turn end:**
- `takeByMode("queue")` → all three
- Concatenated: `"fix login\n\nupdate tests\n\nadd errors"`
- Single user message for next turn

**Should queues be processed one-at-a-time (separate turns)?**

| Approach | Pros | Cons |
|----------|------|------|
| Concatenated (current) | Fast (1 turn), simple | AI might miss items in big message |
| One-at-a-time | Each gets dedicated response | 3x slower, complex loop changes |

**Decision: Keep concatenation.** The AI handles multi-instruction messages well. If the
user wanted separate turns, they'd send them manually. The UI shows all items — the user
explicitly chose to queue multiple items.

#### C. Mixed: steers first, then queues

```
pending: [steer1(t=1), steer2(t=2), queue1(t=3), queue2(t=4)]
```

**Processing (with Bug #2 fix):**
1. Tool-call boundary → `takeByMode("steer")` → `[steer1, steer2]` injected
2. AI processes steer, continues with tools, eventually finishes turn
3. Turn end → `takeByMode("steer")` → empty → `takeByMode("queue")` → `[queue1, queue2]`
4. Queue injected as next turn

**Correct.** Steers affect current step, queues start next turn. Natural priority.

#### D. Mixed: queues first, then steers (the tricky case)

```
pending: [queue1(t=1), steer1(t=2)]
```

**Processing:**
1. Tool-call boundary → `takeByMode("steer")` → `[steer1]` injected
2. AI processes steer, finishes turn
3. Turn end → `takeByMode("queue")` → `[queue1]` injected as next turn

**Steer fires first despite being pushed second.** This is correct for the timeframe model:
steer is urgent mid-turn guidance regardless of when it was pushed. Queue waits for its turn.

But: if the user pushed queue1 then pushed steer1 to CANCEL queue1, the cancel doesn't
work (see "ordering violation" above). The user must manually remove queue1 via the X button.

#### E. Steer pushed while AI has NO tool calls (pure text response)

```
AI generating text (no tools) → finish = "end-turn"
pending: [steer1("focus on X")]
```

**Processing:**
1. `finish === "end-turn"` → existing block fires (not tool-calls)
2. `takeByMode("steer")` → `[steer1]` → injected as user message → continue
3. AI processes steer in new turn

**Steer behaves same as queue here.** This is inherent — you can't interrupt streaming text
generation. There's no "mid" to inject into. The tooltip "Will be injected at the next step"
is slightly misleading in this case, but the message IS processed as soon as possible.

#### F. Steer pushed DURING AI processing of a previous steer

```
1. steer1 injected at tool-call boundary → AI processing
2. User steers again: steer2 pushed
3. AI does more tool calls → next tool-call boundary
4. steer2 found → injected
5. AI continues with both guidance points
```

**This is perfect incremental steering.** Each steer fires at the next available tool-call
boundary. The user can iteratively guide the AI through a complex task.

#### G. Queue pushed, then more queues during AI processing

```
1. AI finishes turn → queue1 injected as new turn
2. AI processing queue1 (doing tool calls)
3. User queues queue2 and queue3
4. AI finishes turn → queue2+queue3 injected
```

**Correct.** Each "batch" of queues fires as one message per turn.

#### H. Rapid steer spam (5+ steers in quick succession)

```
pending: [steer1, steer2, steer3, steer4, steer5]
```

All concatenated into one message. The AI sees a wall of guidance text. This is the user's
intent — they chose to steer 5 times. No limit needed.

**Decision: No hard item limit.** The UI shows all items. Users self-regulate.

---

### Updated Bug 6: Race condition — both modes, not just queue

The original plan only auto-started a loop for `queue` mode. But steer items pushed while
idle have the same problem — they sit stranded with no loop to process them.

**Updated fix:** Auto-start loop for ANY mode when session is idle after push:

```typescript
// In POST /:sessionID/steer handler:
const entry = SessionSteer.push(sessionID, body.text, body.mode)

// If session is idle, auto-start loop to process stranded items
if (SessionStatus.get(sessionID).type === "idle") {
  SessionPrompt.loop({ sessionID, resume_existing: false }).catch(() => {
    SessionSteer.clear(sessionID)
  })
}
```

**Why both modes:** A steer pushed while idle has no turn to steer INTO, but it still
represents user intent. The new loop will consume it at the first iteration's finish check
(existing block at line 328), where steer and queue behave identically. The user's message
gets processed regardless of which button they pressed.

---

### Summary of design decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Multiple steers | Allow, concatenate | All guidance for same step |
| Multiple queues | Allow, concatenate | Faster than one-at-a-time, AI handles multi-instruction |
| Mixed steer+queue | Steer fires first (mid-turn), queue at turn end | Different timeframes, natural priority |
| Cross-mode ordering | takeByMode (ignore interleaving) | Modes operate independently, user can remove via UI |
| Steer without tool calls | Same as queue (end-of-turn) | Inherent LLM limitation, can't interrupt streaming |
| Item limit | None | Users self-regulate via UI, rare to have 5+ items |
| Race condition: idle + push | Auto-start loop for both modes | Stranded items are equally broken regardless of mode |
| Process queues one-at-a-time | No (keep concatenated) | Too slow, not enough benefit |

---

## Testing Plan

- [ ] Settings: Open settings dialog → General tab loads without crash
- [ ] Steer mid-turn: Start AI task with tool calls → Shift+Enter steer → message appears between tool-call steps (not after turn ends)
- [ ] Steer without tools: Start AI text-only task → steer → fires at end-of-turn (expected)
- [ ] Multiple steers: Push 2 steers → both concatenated into one message at next boundary
- [ ] Multiple queues: Push 3 queues → all concatenated into one message at turn end
- [ ] Mixed steer+queue: Push steer + queue → steer fires mid-turn, queue fires at turn end
- [ ] Incremental steering: Steer, wait for boundary, steer again → each fires separately
- [ ] Attachment preservation: Attach image + type text → Enter while working → text queued, image stays
- [ ] Images-only block: Attach image (no text) → Enter while working → toast shown, submit blocked
- [ ] Double-submit: Rapidly press Enter twice while working → only one queue item created
- [ ] Race condition: Queue message right as AI finishes → item gets processed (not stranded)
- [ ] Race condition: Steer message while idle → loop auto-starts, message processed
