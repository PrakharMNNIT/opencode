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

  // ── Edge: multiple removals ───────────────────────────────

  test("handles multiple removals", () => {
    const result = parseSkills("$-tdd $-security fix this")
    expect(result.skills).toEqual([])
    expect(result.removals).toEqual(["tdd", "security"])
    expect(result.text).toBe("fix this")
  })

  // ── Edge: duplicate skills ────────────────────────────────

  test("returns duplicate skills (dedup is caller responsibility)", () => {
    const result = parseSkills("$tdd $tdd fix this")
    expect(result.skills).toEqual([
      { type: "skill", name: "tdd" },
      { type: "skill", name: "tdd" },
    ])
    expect(result.text).toBe("fix this")
  })

  // ── Edge: removal-only input ──────────────────────────────

  test("handles removal-only input with no text", () => {
    const result = parseSkills("$-brainstorming")
    expect(result.skills).toEqual([])
    expect(result.removals).toEqual(["brainstorming"])
    expect(result.text).toBe("")
  })

  // ── Edge: $ with tab separator ────────────────────────────

  test("extracts $skill after tab", () => {
    const result = parseSkills("fix\t$brainstorming the bug")
    expect(result.skills).toEqual([{ type: "skill", name: "brainstorming" }])
    expect(result.text).toBe("fix the bug")
  })

  // ── Edge: multiple spaces before $ ────────────────────────

  test("extracts $skill after multiple spaces", () => {
    const result = parseSkills("fix   $brainstorming the bug")
    expect(result.skills).toEqual([{ type: "skill", name: "brainstorming" }])
    expect(result.text).toBe("fix the bug")
  })

  // ── Edge: single character skill name ─────────────────────

  test("matches single character skill name", () => {
    const result = parseSkills("$x fix")
    expect(result.skills).toEqual([{ type: "skill", name: "x" }])
    expect(result.text).toBe("fix")
  })

  // ── Edge: long skill name ─────────────────────────────────

  test("matches long hyphenated skill name", () => {
    const result = parseSkills("$backend-principle-eng-python-pro-max fix")
    expect(result.skills).toEqual([{ type: "skill", name: "backend-principle-eng-python-pro-max" }])
    expect(result.text).toBe("fix")
  })

  // ── Edge: $ followed by hyphen only (removal with no name) ─

  test("does not match $- alone (no name after hyphen)", () => {
    const result = parseSkills("$- fix the bug")
    expect(result.skills).toEqual([])
    expect(result.removals).toEqual([])
    expect(result.text).toBe("$- fix the bug")
  })

  // ── Edge: skill followed by punctuation ───────────────────

  test("stops at non-word characters", () => {
    const result = parseSkills("$tdd: review this")
    expect(result.skills).toEqual([{ type: "skill", name: "tdd" }])
    // Colon remains in text
    expect(result.text).toBe(": review this")
  })

  // ── Edge: whitespace-only input ───────────────────────────

  test("returns whitespace as-is when no skills (no trim without skills)", () => {
    const result = parseSkills("   ")
    expect(result.skills).toEqual([])
    expect(result.removals).toEqual([])
    // No skills/removals → text returned as-is (trim only runs when stripping)
    expect(result.text).toBe("   ")
  })

  // ── Edge: many skills stress test ─────────────────────────

  test("extracts many skills", () => {
    const result = parseSkills("$a $b $c $d $e $f $g")
    expect(result.skills).toHaveLength(7)
    expect(result.skills.map(s => s.name)).toEqual(["a", "b", "c", "d", "e", "f", "g"])
    expect(result.text).toBe("")
  })
})
