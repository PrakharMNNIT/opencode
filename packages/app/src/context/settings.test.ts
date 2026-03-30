import { describe, expect, test } from "bun:test"
import { monoFontFamily, sansFontFamily, monoInput, sansInput } from "./settings"

// ─── Pure utility tests (no SolidJS reactivity needed) ─────────────

describe("monoFontFamily", () => {
  test("returns base fallback for empty string", () => {
    const result = monoFontFamily("")
    // Empty string → just the base stack (no custom font prepended)
    expect(result).toContain("monospace")
    expect(result).not.toMatch(/^"/)
  })

  test("returns base fallback for undefined", () => {
    const result = monoFontFamily(undefined)
    expect(result).toContain("monospace")
  })

  test("prepends simple font name", () => {
    const result = monoFontFamily("JetBrainsMono")
    expect(result).toMatch(/^JetBrainsMono,/)
  })

  test("quotes font names with spaces", () => {
    const result = monoFontFamily("Fira Code")
    expect(result).toMatch(/^"Fira Code",/)
  })

  test("escapes quotes in font name", () => {
    const result = monoFontFamily('My "Custom" Font')
    expect(result).toContain('\\"Custom\\"')
  })

  test("trims whitespace-only to fallback", () => {
    const result = monoFontFamily("   ")
    expect(result).toContain("monospace")
    expect(result).not.toContain("   ")
  })
})

describe("sansFontFamily", () => {
  test("returns base fallback for empty", () => {
    const result = sansFontFamily("")
    expect(result).toContain("sans-serif")
  })

  test("returns base fallback for undefined", () => {
    const result = sansFontFamily(undefined)
    expect(result).toContain("sans-serif")
  })

  test("prepends simple font name", () => {
    const result = sansFontFamily("Inter")
    expect(result).toMatch(/^Inter,/)
  })
})

describe("monoInput", () => {
  test("returns empty for undefined", () => {
    expect(monoInput(undefined)).toBe("")
  })

  test("passes through value", () => {
    expect(monoInput("JetBrains Mono")).toBe("JetBrains Mono")
  })
})

describe("sansInput", () => {
  test("returns empty for undefined", () => {
    expect(sansInput(undefined)).toBe("")
  })

  test("passes through value", () => {
    expect(sansInput("Inter")).toBe("Inter")
  })
})

// ─── maxWidth clamping logic (extracted for testing) ────────────────
// The actual clamping is: Math.max(0, Math.min(100, value))
// We test the formula directly since the store needs SolidJS runtime.

describe("maxWidth clamping", () => {
  const clamp = (v: number) => Math.max(0, Math.min(100, v))

  test("clamps to 0 for negative values", () => {
    expect(clamp(-1)).toBe(0)
    expect(clamp(-100)).toBe(0)
    expect(clamp(-Infinity)).toBe(0)
  })

  test("clamps to 100 for values over 100", () => {
    expect(clamp(101)).toBe(100)
    expect(clamp(200)).toBe(100)
    expect(clamp(Infinity)).toBe(100)
  })

  test("passes through valid values", () => {
    expect(clamp(0)).toBe(0)
    expect(clamp(50)).toBe(50)
    expect(clamp(100)).toBe(100)
    expect(clamp(5)).toBe(5)
    expect(clamp(95)).toBe(95)
  })

  test("handles step=5 slider values", () => {
    for (let v = 0; v <= 100; v += 5) {
      expect(clamp(v)).toBe(v)
    }
  })

  test("NaN propagates (guarded by Number() || 0 in UI)", () => {
    // The actual UI uses: Number(e.currentTarget.value) || 0
    // So NaN becomes 0 before reaching clamp
    const uiParse = (raw: string) => Number(raw) || 0
    expect(clamp(uiParse(""))).toBe(0)
    expect(clamp(uiParse("abc"))).toBe(0)
    expect(clamp(uiParse("50"))).toBe(50)
  })
})

// ─── fontSize NaN guard (from UI) ──────────────────────────────────

describe("fontSize UI parse guard", () => {
  // UI uses: Number(e.currentTarget.value) || 14
  const parse = (raw: string) => Number(raw) || 14

  test("falls back to 14 for NaN", () => {
    expect(parse("")).toBe(14)
    expect(parse("abc")).toBe(14)
  })

  test("passes through valid numbers", () => {
    expect(parse("10")).toBe(10)
    expect(parse("14")).toBe(14)
    expect(parse("24")).toBe(24)
    expect(parse("16")).toBe(16)
  })

  test("handles 0 as falsy → falls back to 14", () => {
    // This is technically a quirk — 0 is falsy with ||
    // But the slider min is 10, so 0 is never a valid slider value
    expect(parse("0")).toBe(14)
  })
})
