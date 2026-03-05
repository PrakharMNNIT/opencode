import { describe, expect, test } from "bun:test"

// Mirrors the isThinkingBlockError function from session-turn.tsx.
// Tested standalone to avoid SolidJS DOM dependency from the component module.
function isThinkingBlockError(text: string) {
  const lower = text.toLowerCase()
  return lower.includes("thinking") && lower.includes("cannot be modified")
}

describe("isThinkingBlockError", () => {
  test("returns true for Claude thinking block error message", () => {
    expect(
      isThinkingBlockError(
        "`thinking` or `redacted_thinking` blocks in the latest assistant message cannot be modified",
      ),
    ).toBe(true)
  })

  test("returns true for case-insensitive match", () => {
    expect(isThinkingBlockError("THINKING blocks CANNOT BE MODIFIED in message")).toBe(true)
  })

  test("returns false for empty string", () => {
    expect(isThinkingBlockError("")).toBe(false)
  })

  test("returns false for unrelated error", () => {
    expect(isThinkingBlockError("rate limit exceeded")).toBe(false)
  })

  test("returns false when only 'thinking' is present", () => {
    expect(isThinkingBlockError("thinking blocks are great")).toBe(false)
  })

  test("returns false when only 'cannot be modified' is present", () => {
    expect(isThinkingBlockError("this resource cannot be modified")).toBe(false)
  })
})
