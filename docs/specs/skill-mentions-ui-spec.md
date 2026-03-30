# $skill Mentions — UI/UX Behavior Specification

## Problem Statement

The `$skill` mentions feature allows users to type `$` in the prompt input to browse and load skills into a session's context. Currently the implementation has multiple UI/UX gaps that make it unusable:

1. **Pill is plain text** — no visual distinction, can be edited character-by-character
2. **Backspace doesn't delete whole pill** — user has to erase each character
3. **Backspace only removes text, not context** — skill stays loaded even after erasing
4. **Popover doesn't visually scroll** — up/down arrow navigation works in background but UI doesn't follow
5. **No visual feedback** — no count indicator, no clear add/remove toasts
6. **Theme colors hardcoded** — doesn't adapt to light/dark themes

## Intended Behavior

### 1. $ Popover Trigger
- **Trigger:** User types `$` at start of line or after whitespace
- **Guard:** `$$` does NOT trigger (shell escape), `$` mid-word does NOT trigger
- **Popover appears:** Above the input, max-height 320px, scrollable
- **Popover content:** Filtered list of available skills (name + description)
- **Search:** Typing after `$` filters the list (e.g., `$tdd` shows only matching skills)

### 2. Popover Navigation
- **Mouse:** Hover highlights, click selects
- **Arrow keys (↑↓):** Move highlight AND visually scroll the active item into view
- **Enter:** Select highlighted skill
- **Tab:** Select highlighted skill (same as Enter)
- **Escape:** Close popover without selecting
- **Visual indicator:** Highlighted item must have visible background color change

### 3. Skill Selection → Pill Creation
When user selects a skill from popover:
1. The `$query` text in the editor is **replaced** by a styled **pill element**
2. The pill is a `<span>` with `contenteditable=false` — it's an atomic unit
3. **Pill appearance:** 
   - Background: subtle warm/amber tint (theme-aware via CSS variables)
   - Border: 1px solid, slightly more opaque than background
   - Border-radius: 6px
   - Padding: 2px 8px
   - Text: `✨ skillname` in text-syntax-string color
   - The pill is **inline-block** and sits inline with text
4. **Toast:** "✓ Loaded $skillname" appears briefly (success variant)
5. **Popover closes** after selection

### 4. Backspace Behavior (CRITICAL)
- When cursor is adjacent to a pill and user presses Backspace:
  - The **entire pill is removed at once** (not character-by-character)
  - This is achieved by `contenteditable=false` + `userSelect=none` on the span
  - When the pill DOM element is removed, the `handleInput()` detects it missing
  - A **DELETE API call** is made to remove the skill from the server context
  - A **toast** appears: "Removed $skillname" (error/red variant)
  - The `activeSkills()` count decreases, allowing more skills to be added

### 5. Badge Strip (Above Editor)
- When `activeSkills().length > 0`, show a horizontal strip above the editor
- Each badge: `$skillname` with × close button
- Count indicator: `N/5` shown at start
- × click: DELETE API + toast + badge disappears (sync updates reactively)

### 6. MAX_SKILLS Enforcement
- Maximum 5 active skills per session
- Count is based on `activeSkills().length` (server-side, reactive)
- If user tries to add 6th: error toast "Max 5 skills per session"
- If user deletes one skill (now 4/5), they CAN add another (back to 5/5)
- Duplicate check: can't add same skill twice (error toast)

### 7. / Slash Commands Compatibility
- `$` detection is AFTER `/` detection — `/slash` commands are never affected
- Existing `/` popover behavior is completely unchanged
- `@` mentions are also unaffected (checked first)

## Non-Functional Requirements

### Performance
- Popover filter: instant (useFilteredList handles it client-side)
- Pill insertion/removal: synchronous DOM manipulation
- API calls (POST/DELETE skill): fire-and-forget, sync layer updates reactively

### Accessibility
- Popover: `role="listbox"`, `aria-label="Select a skill"`
- Each popover item: `role="option"`, `aria-selected` for active
- Badge × button: `aria-label="Remove skill {name}"`, min touch target 44px
- Keyboard: full arrow/Enter/Tab/Escape support

### Theme
- All colors use CSS variables or `color-mix()` with CSS variable fallbacks
- Light theme: warm amber tint on light background
- Dark theme: warm amber tint on dark background (same variable, auto-adapts)

## Current Implementation Gaps (as of latest build)

| # | Gap | Root Cause | Fix |
|---|-----|-----------|-----|
| 1 | Pill appears as plain text | `contenteditable=false` is set but browser may ignore inline styles | Needs CSS class via Tailwind, not inline styles |
| 2 | Backspace erases char-by-char | Pill `userSelect` may need to be `all` not `none` for atomic selection | Test with `userSelect=all` or use MutationObserver |
| 3 | Context not removed on backspace | handleInput pill detection may not fire correctly | Debug: log pillsInDom vs activeSkills comparison |
| 4 | Popover doesn't scroll visually | DOM traversal to find popover container is fragile | Use ref pattern like slash popover |
| 5 | color-mix() not supported | May not be available in Tauri's WebView | Fallback to rgba with CSS var via Tailwind utility |

## Reference Implementation
The working version exists in `prax-dev` branch (pre-decontamination). Key files:
- `git show prax-dev:packages/app/src/components/prompt-input.tsx` — lines 273-285 (skillApi), 754-800 (handleSkillSelect with pill)
