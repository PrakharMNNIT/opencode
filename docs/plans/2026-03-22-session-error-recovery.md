# Session Error Recovery — Architecture Analysis & Fix

## Problem

When an API error occurs (filename rejection, content moderation, context overflow, etc.), the errored assistant message is stored in the DB. On the next user message, the ENTIRE conversation history — including the content that caused the error — is replayed to the API. This causes the same error to repeat, making the session permanently stuck.

## Root Cause Analysis

### Message Replay Flow
```
User sends new message
  → prompt.ts loop()
  → MessageV2.filterCompacted(MessageV2.stream(sessionID))  // reads ALL messages from DB
  → toModelMessages(msgs, model)                             // converts to API format
    → errored assistant messages: SKIPPED (line 706: continue)
    → user message that CAUSED the error: INCLUDED with all parts
  → LLM.stream() → API call → SAME ERROR → session stuck
```

### DB Layer
- **MessageTable**: stores message info (role, error, timestamps)
- **PartTable**: stores parts (text, file, tool, skill) — IMMUTABLE once written
- Parts persist the original unsanitized data forever
- No update/delete path for individual parts

### Existing Error Handlers in prompt.ts loop()
| Error Type | Handler | Status |
|-----------|---------|--------|
| ContextOverflowError | Auto-compact | ✅ Works |
| Retryable APIError | Retry with backoff | ✅ Works |
| AbortedError | Keep if has content | ✅ Works |
| Thinking block errors | stripLastReasoning | ✅ Works |
| **Non-retryable content errors** | **None — session stuck** | ❌ BUG |

## Fix Implemented (commit 129fd3eb90)

### Approach: Poisoned Message Pre-Scan

In `toModelMessages()`, before converting messages:

1. **Pre-scan**: Collect user message IDs whose assistant response errored (non-retryable, non-abort)
2. **Strip**: When processing a poisoned user message, replace ALL file/media parts with text placeholders
3. **Preserve**: Text content from the user message is kept — only binary/media content is stripped

### Why This Is NOT Hacky

| Concern | Answer |
|---------|--------|
| Only handles files? | No — strips ALL non-text parts from poisoned messages |
| Modifies DB? | No — original data preserved. Strip is transient (conversion only) |
| Loses user text? | No — text parts are preserved. Only binary content removed |
| What about context overflow? | Already handled by auto-compact (separate code path) |
| What about auth errors? | Session can't proceed regardless — no replay issue |
| What about rate limits? | Already retryable — auto-retries with backoff |

### What's Stripped on Replay
- `type: "file"` parts (PDFs, images, docs) → replaced with `[Removed attachment: X — caused API error]`
- Media content that might be rejected by the API

### What's Preserved on Replay
- `type: "text"` parts (user's typed message)
- `type: "compaction"` parts
- `type: "subtask"` parts

## Additional Safeguards

### 1. Filename Sanitization (commit c1259e258f)
Prevents Anthropic filename errors at the source:
```
screencapture-codewiki-google_2026-03_54_02.pdf
→ screencapture-codewiki-google-2026-03-54-02.pdf
```

### 2. Context Logging (commit 4772013819)
Logs full context to `.opencode/log/context/{sessionID}-{datetime}.json` for debugging.

### 3. Manual Recovery
Users can use **Undo** (Ctrl+Z / Cmd+Z) to remove the last message pair from the session.

## Future Considerations

- **Message delete API**: Let users delete specific messages from a session (not just undo last)
- **Error notification**: Show a clearer error message when a message is auto-healed
- **Retry with modifications**: Instead of just stripping, try sanitizing and retrying
