# `$skill` Mentions — Manual Skill Inclusion for OpenCode

**Date:** 2026-03-19
**Status:** Approved
**Author:** Prax Dev
**Scope:** Frontend (UI popover + pills) + Backend (system prompt injection) + CLI

---

## Problem

OpenCode currently loads skills automatically — the agent discovers available skills via the system prompt and calls the `skill` tool to load them. This works well for AI-initiated skill loading, but users have no way to **explicitly request** a specific skill be active for their prompt.

Codex CLI solved this with `$skillname` mentions — the user types `$brainstorming` in the prompt and the skill's SKILL.md is injected into the system instructions. This is user-initiated, explicit, and coexists with automatic discovery.

**Gap:** OpenCode has no `$` prefix, no skill mention mechanism, and no way for users to force-load a skill into context.

## Solution

Add `$` as a third input prefix (alongside `@` for files/agents and `/` for commands) that lets users manually include skills in their prompt. Selected skills appear as inline pills in the editor, and their SKILL.md content is injected into the system prompt.

**Non-destructive:** The existing automatic skill discovery + AI-initiated `skill` tool loading remains completely untouched.

---

## Architecture

### Data Flow

```
User types: "$brainstorming $tdd Fix the login flow"
     ↓
UI: $ prefix detected → skill picker popover → pill created
     ↓
Parts: [SkillPart("brainstorming"), SkillPart("tdd"), TextPart("Fix the login flow")]
     ↓
Backend createUserMessage():
  - SkillParts extracted (NOT sent as user text)
  - Synthetic log: "Loaded skills: brainstorming, tdd"
     ↓
Backend loop() before LLM call:
  - Load SKILL.md for each skill
  - Wrap in <skill> XML tags
  - Append to system prompt array
     ↓
LLM sees: system prompt + skill instructions + user message (without $prefixes)
```

### Components Modified

| Component | File | Change |
|-----------|------|--------|
| **Message schema** | `packages/opencode/src/session/message-v2.ts` | Add `SkillPart` to `Part` union |
| **Prompt context** | `packages/app/src/context/prompt.ts` | Add `SkillPart` to `ContentPart` union |
| **Prompt input** | `packages/app/src/components/prompt-input.tsx` | `$` match, skill popover, pill creation |
| **Slash popover** | `packages/app/src/components/prompt-input/slash-popover.tsx` | `SkillOption` type, skill section |
| **Editor DOM** | `packages/app/src/components/prompt-input/editor-dom.ts` | Pill rendering for `data-type="skill"` |
| **Session prompt** | `packages/opencode/src/session/prompt.ts` | Process skill parts, inject into system prompt |
| **CLI input** | `packages/opencode/src/cli/cmd/tui/routes/session/index.tsx` | Parse `$name` prefixes |

---

## Detailed Design

### 1. SkillPart Type

```typescript
// In message-v2.ts — Part union
export const SkillPart = z.object({
  type: z.literal("skill"),
  id: PartID.zod,
  messageID: MessageID.zod,
  sessionID: SessionID.zod,
  name: z.string(),           // skill name (e.g., "brainstorming")
})

// In prompt context — ContentPart union (UI side)
type SkillContentPart = {
  type: "skill"
  name: string
  content: string      // display text: "$brainstorming"
  start: number
  end: number
}
```

### 2. UI: `$` Prefix Detection

In `prompt-input.tsx`'s `handleInput()`, add a third prefix match after `@` and `/`:

```typescript
// Existing
const atMatch = rawText.substring(0, cursorPosition).match(/@(\S*)$/)
const slashMatch = rawText.match(/^\/(\S*)$/)

// New
const dollarMatch = rawText.substring(0, cursorPosition).match(/\$(\S*)$/)

if (atMatch) {
  // existing @ handling
} else if (slashMatch) {
  // existing / handling
} else if (dollarMatch) {
  skillOnInput(dollarMatch[1])
  setStore("popover", "skill")
} else {
  closePopover()
}
```

### 3. UI: Skill Picker Popover

Extends `PromptPopover` with a `"skill"` mode:

```typescript
type SkillOption = {
  type: "skill"
  name: string
  description: string    // first line of SKILL.md description
}
```

- Data source: `sync.data.skill` (existing skill sync channel) filtered for the current agent
- Fuzzy search via `useFilteredList` (same as @ and /)
- Selecting a skill calls `addPart({ type: "skill", name, content: "$" + name, start: 0, end: 0 })`

### 4. UI: Skill Pills

Inline contenteditable pills with distinct styling:

```html
<span data-type="skill" data-name="brainstorming" contenteditable="false">
  $brainstorming
</span>
```

CSS class: `[&_[data-type=skill]]:text-syntax-string` — warm color (distinct from file=property, agent=type)

### 5. Backend: Skill Injection

In `prompt.ts`'s `createUserMessage()`:

```typescript
// In the parts processing loop:
if (part.type === "skill") {
  // Don't create user message content — extract for system prompt injection
  return [
    {
      messageID: info.id,
      sessionID: input.sessionID,
      type: "text",
      synthetic: true,
      text: `Loaded skill: ${part.name}`,
    },
    {
      ...part,
      messageID: info.id,
      sessionID: input.sessionID,
    },
  ]
}
```

In `loop()`, before the LLM call:

```typescript
// Extract manually-loaded skills from user message parts
const skillParts = lastUserMsg?.parts.filter(p => p.type === "skill") ?? []
const userSkills: string[] = []

for (const sp of skillParts) {
  const skill = await Skill.load(sp.name)
  if (!skill) continue
  // Deduplicate — don't inject if already in auto system prompt
  userSkills.push(
    `<skill>\n<name>${sp.name}</name>\n${skill.content}\n</skill>`
  )
}

const system = [
  ...await SystemPrompt.environment(model),
  ...(skills ? [skills] : []),          // auto-discovered (UNCHANGED)
  ...await InstructionPrompt.system(),
  ...userSkills,                         // NEW: $-mentioned skills
]
```

### 6. CLI: `$name` Prefix Parsing

In the TUI input handler, before creating prompt parts:

```typescript
// Parse $name tokens from raw input
const skillRegex = /\$(\w[\w-]*)/g
const matches = [...rawText.matchAll(skillRegex)]
const skillNames = matches.map(m => m[1])
const cleanText = rawText.replace(skillRegex, "").trim()

// Create parts: skills + remaining text
const parts = [
  ...skillNames.map(name => ({ type: "skill" as const, name })),
  { type: "text" as const, text: cleanText },
]
```

Unmatched `$tokens` (not found in available skills) are left as literal text.

### 7. Interaction with Existing Systems

| System | Impact |
|--------|--------|
| **Auto skill discovery** | NONE — `SystemPrompt.skills()` unchanged |
| **AI skill tool** | NONE — agent can still call `skill` tool to load additional skills |
| **@ mentions** | NONE — `@` still handles files/agents |
| **/ commands** | NONE — `/` still handles slash commands |
| **Steer/Queue** | NONE — skill parts are processed in `createUserMessage()`, before the loop |

### 8. Edge Cases

1. **Unknown skill name**: If `$foobar` doesn't match any available skill → leave as literal text, no error
2. **Duplicate skills**: If user types `$brainstorming $brainstorming` → deduplicate, load once
3. **Auto + manual overlap**: If AI auto-loads a skill that user also `$`-mentioned → system prompt dedup
4. **Empty `$`**: Typing just `$` shows all available skills in the popover
5. **Context budget**: No hard limit on skill count, but each skill consumes 2-10K tokens. Display warning toast if >5 skills loaded (>50K estimated tokens)

---

## Testing

### Unit Tests
- `$` regex parsing: single skill, multiple skills, no skills, invalid names
- SkillPart creation and serialization
- System prompt injection with deduplication
- CLI prefix parsing with skill resolution

### Integration Tests
- UI: type `$`, see popover, select skill, pill appears, submit → skill injected
- CLI: `$brainstorming Fix the login` → skill loaded + clean text sent
- Auto + manual coexistence: AI auto-loads skill A, user `$`-loads skill B → both present

### E2E Tests
- Full flow: type `$brainstorming Fix the login`, submit, verify SKILL.md appears in system prompt

---

## Cherry-Picks from CEO Review (Session Skills System)

### 9. Session-Persistent Skills

Skills loaded via `$` persist for the entire session, not just one message.

**Backend:** Add `activeSkills: string[]` to session state (or a lightweight `SessionSkills` store keyed by sessionID). When `$brainstorming` is typed:
1. Add `"brainstorming"` to `activeSkills[sessionID]`
2. On every subsequent message in that session, inject the skill into system prompt
3. Cleared on new session or explicit removal

**Frontend:** `activeSkills` memo reads from sync data (like `steer_queue`). New skills from `$` parts are added to the session's active list.

### 10. Active Skills Badge Strip

A row above the editor showing loaded skills, reusing the steer queue badge pattern:

```
[brainstorming ×] [tdd ×]              ← removable pills
┌─────────────────────────────────────┐
│  Fix the login flow                 │
├─────────────────────────────────────┤
│  [+] [✨]              [↗] [⬆]    │
└─────────────────────────────────────┘
```

- Rendered as `<Show when={activeSkills().length > 0}>` block above context items
- Each badge: skill name + `×` close button
- Clicking `×` removes the skill from `activeSkills[sessionID]`
- Styled similarly to steer queue badges but with `text-syntax-string` color

### 11. `$-name` Removal Syntax

Typing `$-brainstorming` removes the skill from the active session skills:

```typescript
// In $ match handling:
if (name.startsWith("-")) {
  const skillToRemove = name.slice(1)
  removeActiveSkill(sessionID, skillToRemove)
  // Don't create a pill — just remove and clear the input
}
```

Also works from CLI: `$-brainstorming` in terminal input removes the skill.

---

## Migration

None — this is a new feature with no breaking changes. Existing sessions, messages, and skill configurations are unaffected.

## Rollback

Remove `$` prefix detection from `handleInput()`. Skill pills in existing messages will render as unknown parts (graceful degradation). Session active skills cleared on rollback.
