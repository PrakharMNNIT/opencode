# TODOS

Deferred work items tracked from reviews and planning sessions.

---

## Skill Categories in Popover

**Priority:** P2 | **Effort:** S (human: ~3 hours / CC: ~15 min) | **Depends on:** $skill feature (PR pending)

**What:** Group skills in the `$` popover by source directory (Project Skills, User Skills, Agent Skills) with section headers.

**Why:** When a user has 20+ skills (common with gstack + ECC installed), a flat alphabetical list becomes hard to scan. Categories add visual structure that helps users find skills faster and understand where they come from.

**Context:** Data is already available — `Skill.available()` returns skill objects with a `location` field (file path). Implementation is bucket-by-path-prefix logic (`~/.claude/skills/` → "User Skills", `.opencode/skills/` → "Project Skills", `.agents/skills/` → "Agent Skills") plus 3 section header renders in `slash-popover.tsx`. The popover already supports sections (see "Recent" section from the accepted expansion).

**Deferred from:** CEO Review (2026-03-19, SCOPE EXPANSION mode) — user chose "flat list is fine for v1."

**Added by:** /plan-eng-review on 2026-03-19
