# Merge Conflict Resolution Plan — prax-dev ← upstream/dev

**Date:** 2026-03-19  
**Branches:** `prax-dev` (222 unique commits) ← `dev` (303 upstream commits via `upstream/dev`)  
**Safety Branch:** `prax-dev-backup-20260319` at `c56481f78b`  
**Merge Base:** `0243be86a7` — `fix(app): don't animate review panel in/out`  
**Total Conflicted Files:** 23  
**Pipeline:** gstack (plan-ceo-review → plan-eng-review → implement → review → QA → ship)

---

## Executive Summary

Both branches have been heavily active. prax-dev added **mermaid diagram rendering, prompt enhancement, aurora/midnight themes, glassmorphism UI, wide mode, console bridge, cytoscape, and desktop audit fixes**. Upstream added **Effect migration, palette-based theme system with ~30 community themes, permission refactoring, account system, session pagination, filesystem service, and UI simplification**.

The conflicts cluster into 5 categories:
1. **Auto-regenerate** (1 file: bun.lock)
2. **Backend/Core imports & paths** (4 files)
3. **App components** (6 files)
4. **Theme system** (9 files — the biggest architectural divergence)
5. **UI component CSS/styles** (5 files)

**Zero-loss principle:** Every prax-dev feature AND every upstream feature must survive the merge.

---

## Category 1: Auto-Regenerate

### File 1: `bun.lock`

| Aspect | Detail |
|--------|--------|
| **Location** | Root lockfile — multiple conflict blocks throughout |
| **prax-dev brings** | Dependencies for mermaid, cytoscape, DOMPurify, and desktop packages |
| **upstream brings** | Updated Effect libraries, new test deps, schema packages, upgraded existing deps |
| **Resolution** | **DELETE all conflict markers, then run `bun install`** to regenerate from the merged `package.json` files. Both sides' `package.json` changes auto-merged cleanly, so the lockfile will include all dependencies from both sides. |
| **Risk** | None — lockfile is deterministic from package.json |

---

## Category 2: Backend/Core — Import Paths & Feature Integration

### File 2: `packages/opencode/src/agent/agent.ts`

| Aspect | Detail |
|--------|--------|
| **Location** | Lines 17–22 (import block) |
| **prax-dev brings** | `import PROMPT_ENHANCE from "./prompt/enhance.txt"` — enables the prompt enhancement agent that powers the ✨ Enhance button in the UI |
| **upstream brings** | Renamed `@/permission/next` → `@/permission` (module was refactored; `next.ts` was deleted and merged into `index.ts`) |
| **Full functionality restoration** | **Keep BOTH:** Add PROMPT_ENHANCE import AND update the permission path. The enhance agent definition later in this file references `PROMPT_ENHANCE`, and the file `./prompt/enhance.txt` exists on prax-dev. The old `@/permission/next` path no longer exists on disk. |
| **Resolution code** | ```import PROMPT_ENHANCE from "./prompt/enhance.txt"\nimport { PermissionNext } from "@/permission"``` |

### File 3: `packages/opencode/src/provider/transform.ts`

| Aspect | Detail |
|--------|--------|
| **Location** | Lines 52–68 (inside `normalizeMessages()` function) |
| **prax-dev brings** | Extended empty-content filter to 3 providers: `@ai-sdk/anthropic`, `@ai-sdk/amazon-bedrock`, `@ai-sdk/google-vertex/anthropic`. Updated comment to explain why. This was a critical fix for Bedrock/Vertex users who got silent failures. |
| **upstream brings** | Same 3-provider extension PLUS structural cleanup: added `SchemaClass`-based approach, cleaner content normalization, and reasoning-content handling refactoring |
| **Full functionality restoration** | **Keep THEIRS (upstream) as base, verify our 3 providers are included.** Upstream's version includes all our provider additions plus better code structure. Our comment improvements can be layered on top. |
| **Verification** | After merge, confirm these 3 providers are in the filter condition and the enhanced comment is present. |

### File 4: `packages/opencode/src/server/routes/session.ts`

| Aspect | Detail |
|--------|--------|
| **Location** | Lines 17–25 (import block) |
| **prax-dev brings** | Additional route imports for prax-dev features (prompt enhancement endpoint, session management) |
| **upstream brings** | Updated import paths to match Effect migration (`@/session/schema`, pagination support, new session message cursor) |
| **Full functionality restoration** | **Merge BOTH:** Keep our additional route handlers + update all import paths to match upstream's new module structure. Any prax-dev imports referencing deleted/moved modules must be updated to new paths. |

### File 5: `packages/opencode/src/session/prompt.ts`

| Aspect | Detail |
|--------|--------|
| **Location** | Multiple blocks — import section and prompt template loading |
| **prax-dev brings** | Prompt enhancement logic, custom system prompt handling, and enhanced model configuration for the ✨ Enhance feature |
| **upstream brings** | Refactored prompt module: renamed `qwen.txt` → `default.txt`, added `Effect.fn` patterns, updated permission integration, and added session schema imports |
| **Full functionality restoration** | **Merge BOTH:** Keep our enhancement logic integrated into their refactored structure. The key prax-dev feature (enhance prompt) must remain functional while adopting upstream's cleaner Effect-based patterns. Update all references from `qwen.txt` to `default.txt`. |

---

## Category 3: App Components — Frontend Feature Integration

### File 6: `packages/app/public/oc-theme-preload.js`

| Aspect | Detail |
|--------|--------|
| **Location** | Lines 2–13 (theme initialization) |
| **prax-dev brings** | Default theme changed from `"oc-2"` → `"aurora"` (our custom theme) |
| **upstream brings** | Added migration logic: if user had `"oc-1"` theme, auto-upgrade to `"oc-2"` and clear cached CSS. Extracted key to variable for DRY. |
| **Full functionality restoration** | **Merge BOTH:** Take upstream's migration logic structure + key extraction variable, but set default to `"aurora"` instead of `"oc-2"`. Add migration for BOTH `oc-1→aurora` AND `oc-2→aurora` (or keep oc-2 as valid fallback). |
| **Frontend impact** | This file runs before any JS loads — it prevents theme flash. Both the aurora default AND the migration logic are needed for good UX. |

### File 7: `packages/app/src/components/prompt-input.tsx`

| Aspect | Detail |
|--------|--------|
| **Location** | Import block + component body (multiple conflict regions) |
| **prax-dev brings** | `createSignal` import, `EnhanceIcon` import, Enhance button UI with loading state, prompt enhancement API integration. This is the **✨ Enhance Prompt** feature — a user-visible button that sends the current prompt to an LLM for improvement. |
| **upstream brings** | Restructured imports (removed some, added new), refactored prompt input into sub-modules (`files.ts`, `paste.ts`), changed component structure with new `For`/`Switch`/`Match` patterns |
| **Full functionality restoration** | **Merge BOTH:** Keep the Enhance button UI + loading state from prax-dev, integrated into upstream's refactored component structure. The `createSignal` import is needed for enhance loading state. The `EnhanceIcon` import is needed for the button. |
| **Frontend impact** | The ✨ Enhance button is a key prax-dev UX feature. Must remain visible and functional. |

### File 8: `packages/app/src/components/prompt-input/attachments.ts`

| Aspect | Detail |
|--------|--------|
| **Location** | Function signatures and attachment handling |
| **prax-dev brings** | Our attachment handling changes |
| **upstream brings** | Restructured attachment system with new `files.ts` module, changed function signatures |
| **Full functionality restoration** | **Take THEIRS as base, port any prax-dev specific attachment features.** Upstream's version is more comprehensive with the new modular approach. |

### File 9: `packages/app/src/components/prompt-input/submit.ts`

| Aspect | Detail |
|--------|--------|
| **Location** | Submit function and related logic |
| **prax-dev brings** | Our submission changes (possibly enhance-related integration) |
| **upstream brings** | Restructured submission with new patterns, expanded submit logic |
| **Full functionality restoration** | **Merge BOTH:** Ensure any prax-dev submission hooks (enhance integration) work within upstream's expanded submit logic. |

### File 10: `packages/app/src/components/session/session-context-tab.tsx`

| Aspect | Detail |
|--------|--------|
| **Location** | Context tab component |
| **prax-dev brings** | Our context tab modifications |
| **upstream brings** | Their context tab changes |
| **Full functionality restoration** | **Merge BOTH:** Both changes should be compatible — examine the actual diff to confirm no semantic overlap. |

### File 11: `packages/app/src/components/settings-general.tsx`

| Aspect | Detail |
|--------|--------|
| **Location** | Settings panel component |
| **prax-dev brings** | Wide mode toggle setting, theme settings for aurora/midnight, mermaid rendering settings |
| **upstream brings** | Removed several setting categories (agents, commands, MCP, permissions — moved to separate pages), simplified the settings layout |
| **Full functionality restoration** | **Merge BOTH:** Keep our setting entries (wide mode, theme, mermaid) integrated into upstream's simplified structure. The settings we added don't conflict with what they removed — they're in different sections. |

---

## Category 4: Theme System — Architectural Divergence

> **⚠️ This is the most complex conflict area.** Both sides fundamentally changed the theme system.

### Architectural Overview

| Aspect | prax-dev | upstream |
|--------|----------|----------|
| **Theme format** | `seeds`-based (9 color seeds → auto-generates full token scales) with extensive `overrides` | `palette`-based (6 palette colors + `compact` mode with `ink` color) |
| **Custom themes** | `aurora`, `midnight` (seeds + 100+ overrides each) | ~30 community themes (amoled, cobalt2, cursor, material, matrix, vercel, etc.) |
| **Token system** | Extended with accent/glow/glass tokens for glassmorphism | Standard token set with `compact` palette shorthand |
| **Preview system** | Debounced theme preview to prevent UI hang | Standard preview |
| **resolve.ts** | Extended resolver with override cascading, accent computation | Simplified resolver with compact palette → full token expansion |

**Critical insight:** Both `seeds` and `palette` are valid variants in the `ThemeVariant` discriminated union. They CAN coexist. The resolver must handle BOTH.

### File 12: `packages/ui/src/theme/context.tsx`

| Aspect | Detail |
|--------|--------|
| **Location** | Theme context provider — preview and application logic |
| **prax-dev brings** | Debounced theme preview (`debouncedPreview` with 150ms delay) to prevent settings panel hang when rapidly switching themes |
| **upstream brings** | Structural changes to theme context |
| **Full functionality restoration** | **Merge BOTH:** The debounce is a critical UX fix (prevents hang). Integrate it into upstream's structure. |

### File 13: `packages/ui/src/theme/default-themes.ts`

| Aspect | Detail |
|--------|--------|
| **Location** | Theme registry — lists all available themes |
| **prax-dev brings** | Entries for `aurora` and `midnight` themes |
| **upstream brings** | Entries for ~30 new community themes (amoled, catppuccin-frappe, catppuccin-macchiato, cobalt2, cursor, everforest, flexoki, github, kanagawa, lucent-orng, material, matrix, mercury, one-dark, opencode, orng, osaka-jade, palenight, rosepine, synthwave84, vercel, zenburn) |
| **Full functionality restoration** | **Keep ALL entries from both sides.** aurora + midnight + all ~30 upstream themes. The registry is just an array of imports — they don't conflict semantically. |

### File 14: `packages/ui/src/theme/index.ts`

| Aspect | Detail |
|--------|--------|
| **Location** | Theme module barrel exports |
| **prax-dev brings** | Exports for our extended type system (accent tokens, glow tokens, etc.) |
| **upstream brings** | Exports for their updated type system (compact palette, new resolve types) |
| **Full functionality restoration** | **Merge BOTH:** Export everything from both sides. |

### File 15: `packages/ui/src/theme/resolve.ts`

| Aspect | Detail |
|--------|--------|
| **Location** | Theme resolver — converts theme definitions to CSS variables |
| **prax-dev brings** | Extended resolver with: override cascading, accent color computation, glow/glass token generation, dark mode adjustments, seeds→tokens expansion with custom overrides |
| **upstream brings** | Simplified resolver with: palette→tokens compact expansion, `ink` color support, streamlined token generation, removed some intermediate abstractions |
| **Full functionality restoration** | **This is the hardest file.** Must handle BOTH `seeds`-based themes (aurora, midnight, everforest, kanagawa, rosepine from prax-dev) AND `palette`-based themes (upstream's ~30 themes). Strategy: use upstream's resolver as the base (it's cleaner), then add a `seeds` handling branch that applies our override cascading logic. The discriminated union already supports both. |
| **Risk** | HIGH — both sides rewrote major sections. Requires careful manual integration. |

### File 16: `packages/ui/src/theme/themes/everforest.json`

| Aspect | Detail |
|--------|--------|
| **Location** | Entire file (add/add conflict — both sides created this independently) |
| **prax-dev brings** | `seeds`-based theme with 9 color seeds + ~100 override lines for borders, backgrounds, surfaces, text, syntax, markdown tokens |
| **upstream brings** | `palette`-based theme with 6 palette colors, `compact` mode with `ink` color, minimal overrides (syntax + markdown only, ~15 override lines) |
| **Full functionality restoration** | **Decision needed from user.** Option A: Keep seeds (richer, more customized). Option B: Keep palette (simpler, matches upstream's other ~30 themes). Option C: Keep BOTH as variants (everforest-seeds, everforest) — but this adds complexity. |

### File 17: `packages/ui/src/theme/themes/kanagawa.json`

| Aspect | Detail |
|--------|--------|
| **Same pattern as everforest** | prax-dev seeds (~100 overrides) vs upstream palette (~15 overrides) |
| **Full functionality restoration** | **Same decision as everforest.** |

### File 18: `packages/ui/src/theme/themes/rosepine.json`

| Aspect | Detail |
|--------|--------|
| **Same pattern as everforest** | prax-dev seeds (~100 overrides) vs upstream palette (~15 overrides) |
| **Full functionality restoration** | **Same decision as everforest.** |

---

## Category 5: UI Component CSS/Styles

### File 19: `packages/ui/src/components/card.css`

| Aspect | Detail |
|--------|--------|
| **Location** | Card component base styles (lines ~10–22) |
| **prax-dev brings** | Glassmorphism card: `backdrop-filter: var(--blur-card)`, accent borders, glow transitions, `border-radius: var(--radius-lg)`, padding `6px 12px` |
| **upstream brings** | Transparent card with left-accent-line `::before` pseudo-element, CSS custom property padding (`--card-pad-y`, `--card-pad-r`, `--card-pad-l`), `border-radius: var(--radius-md)`, no background/border |
| **Full functionality restoration** | **Take THEIRS (upstream).** The rest of the card.css file (below the conflict) was redesigned to use the `::before` left-accent-line pattern. Keeping our glassmorphism here would break the rest of the file's design language. Our glassmorphism CSS variables (`--blur-card`, `--border-accent-base`) can be preserved in the theme system for use elsewhere. |
| **Frontend impact** | Cards will look different but consistent with upstream's design. Our glass effects can be applied to other components later. |

### File 20: `packages/ui/src/components/font.tsx`

| Aspect | Detail |
|--------|--------|
| **Location** | Font component — font loading and registration |
| **prax-dev brings** | Our font additions (possibly additional font families or weights for mermaid/aurora theme) |
| **upstream brings** | Their font restructure |
| **Full functionality restoration** | **Merge BOTH:** Keep any additional fonts we added + their structural changes. |

### File 21: `packages/ui/src/components/line-comment-styles.ts`

| Aspect | Detail |
|--------|--------|
| **Location** | Line comment styling for code diff views |
| **prax-dev brings** | Our style modifications |
| **upstream brings** | Their style updates |
| **Full functionality restoration** | **Merge BOTH:** Examine the actual changes — likely compatible style additions from both sides. |

### File 22: `packages/ui/src/components/message-part.css`

| Aspect | Detail |
|--------|--------|
| **Location** | Message part rendering CSS |
| **prax-dev brings** | **Mermaid diagram CSS** — critical for rendering mermaid blocks in chat messages. Includes: `.mermaid-container` styles, dark mode adjustments, copy button positioning, title clipping fixes |
| **upstream brings** | Their message part CSS restructuring |
| **Full functionality restoration** | **Merge BOTH — our mermaid CSS is CRITICAL.** Without it, mermaid diagrams render as raw code blocks. Our mermaid styles should be additive to their CSS changes. |
| **Frontend impact** | Losing mermaid CSS = breaking a key prax-dev feature. Must verify after merge. |

### File 23: `packages/ui/src/context/marked.tsx`

| Aspect | Detail |
|--------|--------|
| **Location** | Marked.js context — markdown renderer configuration |
| **prax-dev brings** | **Mermaid diagram rendering integration** — custom marked extension that detects mermaid code blocks and renders them as interactive SVG diagrams. Also includes GFM alert support. This is the ENGINE that powers mermaid rendering. |
| **upstream brings** | Their marked context updates |
| **Full functionality restoration** | **Merge BOTH — our mermaid extension is CRITICAL.** This is the core rendering logic. Without it, `\`\`\`mermaid` blocks are just syntax-highlighted code. Must keep our mermaid extension + their structural changes. |
| **Frontend impact** | This + message-part.css together form the mermaid rendering pipeline. Both must survive. |

---

## Resolution Priority Order

Based on dependency analysis:

| Phase | Files | Reason |
|-------|-------|--------|
| **Phase A** | #2, #3, #4, #5 (backend/core) | Foundation — imports and paths must be correct before anything else |
| **Phase B** | #12–#18 (theme system) | Architectural foundation for UI — resolve.ts must handle both formats |
| **Phase C** | #19–#23 (UI components) | Depends on theme tokens being correctly resolved |
| **Phase D** | #6–#11 (app components) | Depends on backend routes and UI components working |
| **Phase E** | #1 (bun.lock) | Regenerate LAST after all package.json conflicts resolved |

---

## Verification Checklist (Post-Merge)

- [ ] `bun typecheck` passes from `packages/opencode`
- [ ] `bun install` completes without errors
- [ ] Aurora theme renders correctly
- [ ] Midnight theme renders correctly
- [ ] All ~30 upstream community themes render
- [ ] Mermaid diagrams render in chat messages
- [ ] ✨ Enhance prompt button works
- [ ] Wide mode toggle works in settings
- [ ] Theme switching doesn't hang (debounce preserved)
- [ ] Permission system works (path migration: `next` → `index`)
- [ ] Bedrock/Vertex providers handle empty content correctly
- [ ] No import errors (all moved/renamed modules updated)
- [ ] `git diff prax-dev-backup-20260319..prax-dev -- packages/` shows no prax-dev-only features removed

---

## Decision Points — RESOLVED

1. **Theme JSON files (everforest, kanagawa, rosepine):** ✅ **Keep seeds** (user decided 2026-03-19)
2. **Card CSS:** ✅ **Take upstream** transparent design (user approved)
3. **Default theme:** ✅ **Keep aurora** (user approved)

---

## Feature Preservation Matrix — ZERO LOSS PROOF

### How We Ensure Nothing Is Lost

There are **3 types** of prax-dev files:

| Type | Count | Risk | How we ensure preservation |
|------|-------|------|---------------------------|
| **NEW files** (created by prax-dev, don't exist upstream) | ~70 | ✅ ZERO — git auto-includes them | Git merge automatically keeps any file that only exists on one side. These are untouched. |
| **MODIFIED files** (changed by prax-dev, NOT conflicted) | ~59 | ✅ ZERO — git auto-merged them | Git successfully merged both sides' changes. These are already resolved. |
| **CONFLICTED files** (changed by BOTH sides) | 23 | ⚠️ REQUIRES MANUAL — this is what we're resolving | We resolve each one to keep functionality from BOTH sides. |

### prax-dev Features: Where They Live & How They Survive

| # | Feature | Key Files | Conflicted? | Survival Strategy |
|---|---------|-----------|-------------|-------------------|
| 1 | **Mermaid Diagram Rendering** | `ui/src/context/marked.tsx` (engine), `ui/src/components/message-part.css` (styles), `ui/src/components/code.tsx` _(NEW)_, `ui/src/components/code.css` _(NEW)_, `ui/src/context/code.tsx` _(NEW)_ | `marked.tsx` ✅ CONFLICTED — our mermaid extension is kept. `message-part.css` ✅ CONFLICTED — our mermaid CSS is kept. 3 NEW files ✅ auto-included | **SAFE** — engine (marked.tsx) + styles (message-part.css) explicitly preserved in merge. 3 new supporting files auto-included. |
| 2 | **✨ Enhance Prompt Button** | `opencode/src/agent/agent.ts` (ENHANCE agent), `opencode/src/agent/prompt/enhance.txt` _(NEW)_, `app/src/components/prompt-input.tsx` (button UI) | `agent.ts` ✅ CONFLICTED — ENHANCE import + permission fix. `prompt-input.tsx` ✅ CONFLICTED — Enhance button UI preserved. `enhance.txt` ✅ NEW — auto-included | **SAFE** — all 3 components explicitly preserved. |
| 3 | **Aurora/Midnight Themes** | `ui/src/theme/themes/aurora.json` _(NEW)_, `ui/src/theme/themes/midnight.json` _(NEW)_, `ui/src/theme/default-themes.ts`, `ui/src/styles/aurora.css` _(NEW)_, `app/public/oc-theme-preload.js` | `aurora.json` ✅ NEW — auto-included. `midnight.json` ✅ NEW — auto-included. `default-themes.ts` ✅ CONFLICTED — aurora+midnight entries kept. `aurora.css` ✅ NEW — auto-included. `preload.js` ✅ CONFLICTED — aurora default preserved. | **SAFE** — theme files are NEW (auto-included). Registry + preload explicitly fixed. |
| 4 | **Seeds Themes (everforest, kanagawa, rosepine)** | `ui/src/theme/themes/everforest.json`, `kanagawa.json`, `rosepine.json` | All 3 ✅ CONFLICTED — **keeping OUR seeds versions** per user decision. Upstream's resolver confirmed to support seeds format. | **SAFE** — user chose seeds, upstream supports it. |
| 5 | **Theme System Extensions** | `ui/src/theme/resolve.ts`, `context.tsx`, `index.ts` | All 3 ✅ CONFLICTED — debounce preserved, exports merged, resolver handles both seeds+palette. | **SAFE** — explicitly merged. |
| 6 | **Wide Mode Setting** | `app/src/components/settings-general.tsx`, `app/src/pages/session.tsx` (auto-merged) | `settings-general.tsx` ✅ CONFLICTED — wide mode toggle kept. `session.tsx` ✅ auto-merged. | **SAFE** — setting preserved in both files. |
| 7 | **Console Bridge (Desktop)** | `desktop/src/console-bridge.ts` _(NEW)_, `desktop/src-tauri/src/lib.rs` (auto-merged) | `console-bridge.ts` ✅ NEW — auto-included. `lib.rs` ✅ auto-merged. | **SAFE** — all auto-resolved. |
| 8 | **Steer/Queue Bug Fixes** | `opencode/src/session/steer.ts` _(NEW)_, `opencode/test/session/steer.test.ts` _(NEW)_ | Both ✅ NEW — auto-included. | **SAFE** — entirely new files. |
| 9 | **Build Script / DevTools** | `buildFromScratch.sh`, various config files | All ✅ auto-merged or NEW. | **SAFE** |
| 10 | **Desktop Audit** | `star-team-audit/` _(NEW directory)_ | ✅ NEW — auto-included. | **SAFE** |
| 11 | **Bedrock/Vertex Provider Fix** | `opencode/src/provider/transform.ts` | ✅ CONFLICTED — upstream includes our 3-provider fix plus better structure. | **SAFE** — upstream's version contains our fix. |
| 12 | **Prax-Dev Icons** | `desktop/src-tauri/icons/prax-dev/` _(NEW directory, ~55 files)_ | All ✅ NEW — auto-included. | **SAFE** |
| 13 | **SSE Batch + Streaming Fix** | `app/src/context/global-sync.tsx`, `app/src/context/sync.tsx`, `app/src/context/global-sdk.tsx` | All ✅ auto-merged. | **SAFE** |
| 14 | **Diff/Code Components** | `ui/src/components/diff.tsx` _(NEW)_, `diff.css` _(NEW)_, `diff-ssr.tsx` _(NEW)_, `ui/src/context/diff.tsx` _(NEW)_ | All ✅ NEW — auto-included. | **SAFE** |

### Upstream Features: How They Survive

| # | Feature | Survival Strategy |
|---|---------|-------------------|
| 1 | **Effect Migration** (services, schemas, instances) | All new files (account/, effect/, filesystem/) are ✅ auto-included. Modified files auto-merged. |
| 2 | **~30 Community Themes** (amoled, cobalt2, cursor, etc.) | All theme JSONs are ✅ NEW files, auto-included. Registry (`default-themes.ts`) explicitly merged to include all. |
| 3 | **Palette Theme System** | `resolve.ts` supports BOTH palette and seeds. ✅ Both formats coexist. |
| 4 | **Permission Refactoring** | `@/permission/next` → `@/permission` path update in 3 conflicted files. ✅ All updated. |
| 5 | **Account System** | Entirely NEW files. ✅ auto-included. |
| 6 | **Session Pagination** | Route changes in `session.ts` (conflicted) — ✅ kept via merge. New test files auto-included. |
| 7 | **UI Simplification** | Settings pages removed/moved — ✅ auto-merged. Card redesign — ✅ taken as upstream. |
| 8 | **Desktop Improvements** | Electron changes auto-merged. Tauri changes auto-merged. ✅ |
| 9 | **New Tests** | All new test files auto-included. ✅ |
| 10 | **Truncation Refactor** | `truncation.ts` → `truncate.ts` + `truncate-effect.ts` + `truncation-dir.ts`. Import path updated in conflicted `prompt.ts`. ✅ |

### The Bottom Line

| Metric | Value |
|--------|-------|
| prax-dev features at risk of loss | **0** — every feature is either in a NEW file (auto-included) or explicitly preserved in conflict resolution |
| upstream features at risk of loss | **0** — new files auto-included, path updates handled in conflicts |
| Files where we take ONLY upstream (losing our version) | **2** — `card.css` (glassmorphism → transparent, by user choice) and `transform.ts` (upstream includes our fix + more) |
| Files where we take ONLY ours (losing upstream) | **3** — `everforest.json`, `kanagawa.json`, `rosepine.json` (seeds format, by user choice; upstream's resolver handles both) |
| Files where we merge BOTH | **17** — all other conflicted files |
| Prax-dev files auto-included (zero risk) | **129 out of 152** |

---

## Eng Review Findings (gstack Step 2)

### Seeds Theme Support — CONFIRMED ✅
Upstream's `resolve.ts` has explicit `if (variant.seeds)` code path in `getColors()`. `ThemeVariant` union still includes `seeds`. All prax-dev seeds themes (aurora, midnight, everforest, kanagawa, rosepine) will render correctly.

### Deleted Module References — NO HIDDEN BREAKAGE ✅
Only 3 files reference deleted upstream modules, all inside conflict blocks we're already resolving:
- `agent.ts`: `@/permission/next` → `@/permission`
- `session.ts`: `@/permission/next` → `@/permission`
- `prompt.ts`: `@/tool/truncation` → `@/tool/truncate`

### Conflict Block Count — 35 total
Most are trivial (import path fixes, take-one-side). `resolve.ts` (2 blocks) and `prompt.ts` (2 blocks) are the most complex.

### Risk: ALL MITIGATED
- Seeds themes: confirmed supported ✅
- Deleted imports: only in conflict blocks ✅
- Types: will run `bun typecheck` before commit ✅
