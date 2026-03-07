# Code Review: BUILD-FROM-SCRATCH.md + buildFromScratch.sh

**Files reviewed**: 2 files
**Overall assessment**: COMMENT — solid work with some improvements needed

---

## Findings

### P0 — Critical
(none)

### P1 — High

**1. buildFromScratch.sh:177 — `set -e` + error handler breaks cargo build failure path**

The `cargo tauri build ... || { restore; die; }` pattern inside `set -e` can behave unexpectedly. If the `python3` restore command inside the `||` block fails, the script exits immediately without printing the "DMG build failed" message.

**Fix:** Use a `trap` for cleanup instead of inline `||`:
```bash
trap 'restore_conf' EXIT
cargo tauri build --bundles dmg
trap - EXIT
```

---

**2. buildFromScratch.sh:149 — `SIDECAR` variable used but never declared in global scope**

`SIDECAR` is set inside `resolve_arch()` but used in Step 5. If someone adds `--dmg-only` without `resolve_arch` running first, `SIDECAR` is empty → sidecar copied to wrong path silently.

**Fix:** Initialize `SIDECAR=""` at top with other globals, add guard: `[[ -z "$SIDECAR" ]] && die "Architecture not resolved"`

---

### P2 — Medium

**3. buildFromScratch.sh:75 — `check_min_version` function defined but never called**

The function exists but no step invokes it. Either call it for bun (≥1.0) and cargo (≥1.70) or remove dead code.

---

**4. buildFromScratch.sh:164-176 — Python3 dependency not checked**

The config patching uses `python3` but it's never verified in prerequisites. A fresh macOS install might not have it.

**Fix:** Add `check_cmd "python3"` in Step 1, or use `sed`/`jq` instead.

---

**5. BUILD-FROM-SCRATCH.md — Platform says "macOS (Apple Silicon)" only**

The script supports both arm64 and x86_64, but the doc says Apple Silicon only. Intel users would copy the wrong sidecar name.

**Fix:** Change to "macOS (Apple Silicon / Intel)" and note the sidecar name differs by arch.

---

**6. BUILD-FROM-SCRATCH.md — Quick Reference `cd` commands accumulate wrong cwd**

After `cd packages/opencode` + `cd ../..` + `cd packages/desktop` + `cd src-tauri`, user is nested deep. The final `open target/release/bundle/dmg/` assumes correct cwd. If copy-pasted into separate terminals, paths break.

**Fix:** Use absolute paths from repo root in the quick reference section.

---

**7. buildFromScratch.sh:131 — `-perm +111` is deprecated macOS find syntax**

macOS `find` supports it but prints deprecation warnings. 

**Fix:** Use `-perm /111` for portability.

---

### P3 — Low

**8. buildFromScratch.sh — Log file lands in repo root, shows in `git status`**

`build-*.log` files land in `$SCRIPT_DIR` (repo root). They'll appear as untracked files.

**Fix:** Add `build-*.log` to `.gitignore`, or log to `/tmp/opencode-build-*.log`.

---

**9. BUILD-FROM-SCRATCH.md — Missing Xcode CLT prerequisite**

Rust/Tauri on macOS needs `xcode-select --install` for the linker. Not mentioned.

---

**10. buildFromScratch.sh — No cleanup of sidecar after build**

The sidecar binary in `src-tauri/sidecars/` persists after build. Could confuse `git status`.

**Fix:** Add optional cleanup in summary step.

---

## Summary

| Priority | Count | Action |
|----------|-------|--------|
| P0 | 0 | — |
| P1 | 2 | Fix before using in production |
| P2 | 5 | Fix in this iteration |
| P3 | 3 | Nice to have |
