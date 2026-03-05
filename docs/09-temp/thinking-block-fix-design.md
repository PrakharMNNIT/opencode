# Design: Fix Thinking Block Error

**Date:** 2026-02-25
**Status:** Implemented

## Problem
When using Claude models with extended thinking, the API returns `thinking`/`redacted_thinking` blocks. When OpenCode replays these back (on next message or compaction), if they're modified during storage/retrieval, Claude rejects them:
```
messages.3.content.1: `thinking` or `redacted_thinking` blocks in the latest assistant message cannot be modified
```

Session becomes stuck — even compaction triggers the same error.

## Root Cause
`MessageV2.toModelMessages()` stores reasoning parts as `{type: "reasoning", text: part.text}` but the original API response had `{type: "thinking", thinking: "..."}`. The reconstruction is not byte-identical. Claude's constraint only applies to the LAST assistant message.

## Solution: Configurable Thinking Strategy

Three options, user-selectable via `compaction.thinking_strategy` in `opencode.json`:

### Strategy "none" (default)
- Sends thinking blocks as-is — original behavior
- No special handling; if blocks are modified during storage, the API may reject them

### Strategy "strip"
- Always strips reasoning/thinking blocks from the last assistant message before sending to API
- Proactive — prevents the error from ever occurring
- Trade-off: Claude loses its own thinking context for the most recent turn

### Strategy "compact"
- Preserves reasoning blocks (sends them to API as-is)
- When the thinking block error occurs, auto-triggers compaction
- Compaction summarizes the conversation, removing the problematic blocks
- Trade-off: First message after thinking blocks may fail, then auto-recovers

## Configuration

In `opencode.json`:
```json
{
  "compaction": {
    "thinking_strategy": "none"  // or "strip" or "compact"
  }
}
```

Default is `"none"` (original behavior). Use `"strip"` for maximum reliability.

## Implementation

### Files Modified

1. **`packages/opencode/src/config/config.ts`**
   - Added `thinking_strategy: z.enum(["none", "strip", "compact"]).optional().default("none")` to compaction config

2. **`packages/opencode/src/session/message-v2.ts`**
   - `toModelMessages()` now accepts `opts?: { stripLastReasoning?: boolean }`
   - Stripping is opt-in: when `options.stripLastReasoning === true`, strip reasoning from last assistant message
   - When omitted or `false`, reasoning blocks are preserved (default / "compact" strategy)

3. **`packages/opencode/src/session/prompt.ts`**
   - Reads `config.compaction?.thinking_strategy` to determine `stripLastReasoning`
   - Passes the flag to `MessageV2.toModelMessages()`

4. **`packages/opencode/src/session/processor.ts`**
   - In error handler, detects thinking block error via message pattern matching
   - When strategy is "compact" and thinking error detected, returns "compact" to trigger auto-compaction
   - This causes the `prompt.ts` loop to prune + compact, then retry

## Flow Diagrams

### Strip Strategy

```
User sends message → toModelMessages(strip=true)
  → Reasoning removed from last assistant message
  → API receives clean messages → Success
```

### Compact Strategy
```
User sends message → toModelMessages(strip=false)
  → Reasoning preserved in messages
  → API call → Error: "thinking blocks cannot be modified"
  → processor.ts detects error → returns "compact"
  → prompt.ts loop: prune + create compaction
  → Compaction summarizes conversation (removes old thinking blocks)
  → Retry succeeds with clean context
```

## Testing
- With "strip" strategy: Long conversations with Claude Opus should never hit thinking block errors
- With "compact" strategy: First message after a session resume may trigger compaction, then recover
- Both strategies: Session compaction still works normally
- Both strategies: New sessions (no previous thinking blocks) work identically
