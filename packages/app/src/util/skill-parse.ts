// ─── $skill mention parsing ─────────────────────────────────
// Extracts $name and $-name tokens from raw input text.
// Guards: $ must be at start-of-line or after whitespace (not $$).
// $name  → skill addition
// $-name → skill removal

export interface SkillParseResult {
  skills: Array<{ type: "skill"; name: string }>
  removals: string[]
  text: string
}

const SKILL_PATTERN = /(?:^|(?<=\s))\$(-?[a-zA-Z][\w-]*)/g
const SKILL_STRIP = /(?:^|(?<=\s))\$-?[a-zA-Z][\w-]*/g

export function parseSkills(input: string): SkillParseResult {
  const skills: Array<{ type: "skill"; name: string }> = []
  const removals: string[] = []
  let m
  while ((m = SKILL_PATTERN.exec(input)) !== null) {
    const token = m[1]
    if (token.startsWith("-")) removals.push(token.slice(1))
    else skills.push({ type: "skill" as const, name: token })
  }
  // Reset lastIndex for reuse (global regex)
  SKILL_PATTERN.lastIndex = 0

  let text = input
  if (skills.length > 0 || removals.length > 0) {
    text = input
      .replace(SKILL_STRIP, "")
      .replace(/\s{2,}/g, " ")
      .trim()
    SKILL_STRIP.lastIndex = 0
  }

  return { skills, removals, text }
}
