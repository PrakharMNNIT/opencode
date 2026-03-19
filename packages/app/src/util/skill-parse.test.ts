import { describe, expect, test } from "bun:test"
import { parseSkills } from "./skill-parse"

describe("parseSkills", () => {
  // ── Basic skill detection ──────────────────────────────────

  test("extracts single $skill from input", () => {
    const result = parseSkills("$brainstorming fix the bug")
    expect(result.skills).toEqual([{ type: "skill", name: "brainstorming" }])
    expect(result.removals).toEqual([])
    expect(result.text).toBe("fix the bug")
  })

  test("extracts multiple $skills from input", () => {
    const result = parseSkills("$tdd $security review this code")
    expect(result.skills).toEqual([
      { type: "skill", name: "tdd" },
      { type: "skill", name: "security" },
    ])
    expect(result.text).toBe("review this code")
  })

  test("extracts $skill at end of input", () => {
    const result = parseSkills("fix the bug $brainstorming")
    expect(result.skills).toEqual([{ type: "skill", name: "brainstorming" }])
    expect(result.text).toBe("fix the bug")
  })

  test("extracts $skill in middle of input", () => {
    const result = parseSkills("fix $brainstorming the bug")
    expect(result.skills).toEqual([{ type: "skill", name: "brainstorming" }])
    expect(result.text).toBe("fix the bug")
  })

  // ── $-removal syntax ──────────────────────────────────────

  test("extracts $-name as removal", () => {
    const result = parseSkills("$-brainstorming fix the bug")
    expect(result.skills).toEqual([])
    expect(result.removals).toEqual(["brainstorming"])
    expect(result.text).toBe("fix the bug")
  })

  test("handles mixed skills and removals", () => {
    const result = parseSkills("$tdd $-security review this")
    expect(result.skills).toEqual([{ type: "skill", name: "tdd" }])
    expect(result.removals).toEqual(["security"])
    expect(result.text).toBe("review this")
  })

  // ── Guard: $$ not matched (escape hatch) ──────────────────

  test("does not match $$ prefix", () => {
    const result = parseSkills("$$brainstorming fix the bug")
    expect(result.skills).toEqual([])
    expect(result.removals).toEqual([])
    expect(result.text).toBe("$$brainstorming fix the bug")
  })

  // ── Guard: $ mid-word not matched ─────────────────────────

  test("does not match $ in middle of word", () => {
    const result = parseSkills("cost$brainstorming fix the bug")
    expect(result.skills).toEqual([])
    expect(result.removals).toEqual([])
    expect(result.text).toBe("cost$brainstorming fix the bug")
  })

  // ── Guard: shell mode ($VAR patterns) ─────────────────────

  test("matches $HOME (uppercase treated as skill name)", () => {
    // Uppercase names are valid skill names per the regex
    const result = parseSkills("$HOME/path fix")
    // Note: /path is not part of the skill name ([\w-] stops at /)
    expect(result.skills).toEqual([{ type: "skill", name: "HOME" }])
    expect(result.text).toBe("/path fix")
  })

  // ── Edge: no skills ───────────────────────────────────────

  test("returns original text when no $skills present", () => {
    const result = parseSkills("just a normal prompt")
    expect(result.skills).toEqual([])
    expect(result.removals).toEqual([])
    expect(result.text).toBe("just a normal prompt")
  })

  test("returns original text for empty input", () => {
    const result = parseSkills("")
    expect(result.skills).toEqual([])
    expect(result.removals).toEqual([])
    expect(result.text).toBe("")
  })

  // ── Edge: only skill, no remaining text ───────────────────

  test("handles skill-only input with no text", () => {
    const result = parseSkills("$brainstorming")
    expect(result.skills).toEqual([{ type: "skill", name: "brainstorming" }])
    expect(result.text).toBe("")
  })

  // ── Edge: hyphenated skill names ──────────────────────────

  test("handles hyphenated skill names", () => {
    const result = parseSkills("$clean-code fix this")
    expect(result.skills).toEqual([{ type: "skill", name: "clean-code" }])
    expect(result.text).toBe("fix this")
  })

  // ── Edge: underscored skill names ─────────────────────────

  test("handles underscored skill names", () => {
    const result = parseSkills("$my_skill fix this")
    expect(result.skills).toEqual([{ type: "skill", name: "my_skill" }])
    expect(result.text).toBe("fix this")
  })

  // ── Edge: whitespace collapsing ───────────────────────────

  test("collapses extra whitespace after stripping", () => {
    const result = parseSkills("fix  $brainstorming  the bug")
    expect(result.skills).toEqual([{ type: "skill", name: "brainstorming" }])
    expect(result.text).toBe("fix the bug")
  })

  // ── Consecutive calls (regex lastIndex reset) ─────────────

  test("works correctly on consecutive calls", () => {
    const r1 = parseSkills("$tdd fix")
    const r2 = parseSkills("$security review")
    expect(r1.skills).toEqual([{ type: "skill", name: "tdd" }])
    expect(r2.skills).toEqual([{ type: "skill", name: "security" }])
  })

  // ── $ after newline (multiline input) ─────────────────────

  test("extracts $skill after newline", () => {
    const result = parseSkills("fix the bug\n$brainstorming more context")
    expect(result.skills).toEqual([{ type: "skill", name: "brainstorming" }])
    // \n before $token is stripped, whitespace collapsed to single space
    expect(result.text).toBe("fix the bug more context")
  })

  // ── $ must start with letter ──────────────────────────────

  test("does not match $ followed by number", () => {
    const result = parseSkills("$123 fix the bug")
    expect(result.skills).toEqual([])
    expect(result.removals).toEqual([])
    expect(result.text).toBe("$123 fix the bug")
  })
})
