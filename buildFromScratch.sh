#!/bin/bash
set -euo pipefail

# ============================================================================
# OpenCode: Build from Scratch
# Builds CLI + Desktop DMG from a fresh clone
# Platform: macOS (Apple Silicon / Intel)
# Usage: ./buildFromScratch.sh [--cli-only] [--dmg-only] [--skip-deps]
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG="/tmp/opencode-build-$(date +%Y%m%d-%H%M%S).log"
ARCH="$(uname -m)"
RUST_TARGET=""
SIDECAR=""
CONF_PATCHED=false
CONF_ORIG_CMD=""

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# --- Flags ---
CLI_ONLY=false
DMG_ONLY=false
SKIP_DEPS=false

for arg in "$@"; do
  case "$arg" in
    --cli-only)  CLI_ONLY=true ;;
    --dmg-only)  DMG_ONLY=true ;;
    --skip-deps) SKIP_DEPS=true ;;
    --help|-h)
      echo "Usage: ./buildFromScratch.sh [--cli-only] [--dmg-only] [--skip-deps]"
      echo "  --cli-only   Build only the CLI binary"
      echo "  --dmg-only   Build only the DMG (assumes CLI already built)"
      echo "  --skip-deps  Skip bun install"
      exit 0
      ;;
  esac
done

# --- Logging ---
exec > >(tee -a "$LOG") 2>&1

log()   { echo -e "${GREEN}[✓]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
err()   { echo -e "${RED}[✗]${NC} $1"; }
info()  { echo -e "${BLUE}[→]${NC} $1"; }
header(){ echo -e "\n${BOLD}${CYAN}═══ $1 ═══${NC}\n"; }

die() { err "$1"; echo ""; err "Build failed. See log: $LOG"; exit 1; }

# --- Cleanup trap: restore tauri.conf.json if patched ---
restore_conf() {
  if [[ "$CONF_PATCHED" == true && -n "$CONF_ORIG_CMD" ]]; then
    local conf="$SCRIPT_DIR/packages/desktop/src-tauri/tauri.conf.json"
    python3 -c "
import json
with open('$conf') as f:
    cfg = json.load(f)
cfg['build']['beforeBuildCommand'] = '$CONF_ORIG_CMD'
with open('$conf','w') as f:
    json.dump(cfg, f, indent=2)
" 2>/dev/null && log "Restored tauri.conf.json" || warn "Failed to restore tauri.conf.json — run: git checkout packages/desktop/src-tauri/tauri.conf.json"
    CONF_PATCHED=false
  fi
  # Cleanup sidecar if it exists
  local sidecar="$SCRIPT_DIR/packages/desktop/src-tauri/sidecars"
  if [[ -d "$sidecar" ]]; then
    rm -rf "$sidecar"
    log "Cleaned up sidecars directory"
  fi
}
trap restore_conf EXIT

# --- Prerequisite Checks ---
check_cmd() {
  local cmd="$1"
  local install_hint="${2:-}"
  if command -v "$cmd" &>/dev/null; then
    local ver
    ver=$("$cmd" --version 2>&1 | head -1) || ver="unknown"
    log "$cmd found: $ver"
    return 0
  else
    err "$cmd not found"
    [[ -n "$install_hint" ]] && info "Install: $install_hint"
    return 1
  fi
}

check_min_version() {
  local cmd="$1"
  local min="$2"
  local current
  current=$("$cmd" --version 2>&1 | grep -oE '[0-9]+\.[0-9]+' | head -1) || current="0.0"
  if [[ "$(printf '%s\n' "$min" "$current" | sort -V | head -1)" == "$min" ]]; then
    log "$cmd version $current >= $min ✓"
    return 0
  else
    warn "$cmd version $current < $min (minimum required)"
    return 1
  fi
}

resolve_arch() {
  case "$ARCH" in
    arm64|aarch64)
      RUST_TARGET="aarch64-apple-darwin"
      SIDECAR="opencode-cli-aarch64-apple-darwin"
      log "Architecture: Apple Silicon (arm64)"
      ;;
    x86_64)
      RUST_TARGET="x86_64-apple-darwin"
      SIDECAR="opencode-cli-x86_64-apple-darwin"
      log "Architecture: Intel (x86_64)"
      ;;
    *)
      die "Unsupported architecture: $ARCH"
      ;;
  esac
}

header "OpenCode Build from Scratch"
echo "Started: $(date)"
echo "Log: $LOG"
echo "Working directory: $SCRIPT_DIR"
echo ""

# --- Step 1: Check Prerequisites ---
header "Step 1: Checking Prerequisites"

MISSING=0

check_cmd "git" "xcode-select --install" || MISSING=1
check_cmd "bun" "curl -fsSL https://bun.sh/install | bash" || MISSING=1
check_cmd "cargo" "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh" || MISSING=1
check_cmd "python3" "xcode-select --install (or brew install python3)" || MISSING=1

# Version checks
if command -v bun &>/dev/null; then
  check_min_version "bun" "1.0" || true
fi
if command -v cargo &>/dev/null; then
  check_min_version "cargo" "1.70" || true
fi

if command -v cargo &>/dev/null; then
  if cargo tauri --version &>/dev/null; then
    log "cargo tauri found: $(cargo tauri --version 2>&1 | head -1)"
  else
    warn "tauri-cli not installed. Installing..."
    cargo install tauri-cli 2>&1 | tail -3 || die "Failed to install tauri-cli"
    log "tauri-cli installed"
  fi
fi

# Check Xcode CLT (needed for Rust linker on macOS)
if xcode-select -p &>/dev/null; then
  log "Xcode CLT found: $(xcode-select -p)"
else
  warn "Xcode Command Line Tools not found"
  info "Install: xcode-select --install"
  MISSING=1
fi

if [[ "$MISSING" -eq 1 ]]; then
  die "Missing prerequisites. Install them and re-run."
fi

resolve_arch

# --- Step 2: Install Dependencies ---
if [[ "$SKIP_DEPS" == false ]]; then
  header "Step 2: Installing Dependencies"
  cd "$SCRIPT_DIR"
  info "Running bun install..."
  bun install --yes || die "bun install failed"
  log "Dependencies installed"
else
  header "Step 2: Skipping Dependencies (--skip-deps)"
fi

# --- Step 3: Build CLI ---
if [[ "$DMG_ONLY" == false ]]; then
  header "Step 3: Building CLI"
  cd "$SCRIPT_DIR/packages/opencode"

  info "Building opencode CLI..."
  # BUN_NO_INSTALL_PROMPT suppresses interactive prompts in sub-processes
  echo "" | bun run build || die "CLI build failed"

  # Select the platform-correct binary (darwin, not linux)
  case "$ARCH" in
    arm64|aarch64) CLI_BIN_BUILD="dist/opencode-darwin-arm64/bin/opencode" ;;
    x86_64)        CLI_BIN_BUILD="dist/opencode-darwin-x64/bin/opencode" ;;
  esac

  if [[ -f "$CLI_BIN_BUILD" ]]; then
    # Verify it's a Mach-O binary, not ELF
    if file "$CLI_BIN_BUILD" | grep -q "Mach-O"; then
      log "CLI built: packages/opencode/$CLI_BIN_BUILD (Mach-O ✓)"
      CLI_SIZE=$(du -sh "$CLI_BIN_BUILD" | cut -f1)
      log "CLI size: $CLI_SIZE"
    else
      err "CLI binary is wrong format: $(file "$CLI_BIN_BUILD")"
      die "Expected Mach-O binary for macOS"
    fi
  else
    die "CLI binary not found at $CLI_BIN_BUILD — build may have failed"
  fi
else
  header "Step 3: Skipping CLI Build (--dmg-only)"
fi

# --- Step 4: Build Frontend ---
if [[ "$CLI_ONLY" == false ]]; then
  header "Step 4: Building Desktop Frontend"
  cd "$SCRIPT_DIR/packages/desktop"

  info "Building with vite..."
  bunx vite build || die "Frontend build failed"

  if [[ -d "dist" ]]; then
    log "Frontend built: packages/desktop/dist/"
    BUNDLE_SIZE=$(du -sh dist | cut -f1)
    log "Bundle size: $BUNDLE_SIZE"
  else
    die "Frontend dist/ not found"
  fi

  # --- Step 5: Place CLI Sidecar ---
  header "Step 5: Placing CLI Sidecar"

  [[ -z "$SIDECAR" ]] && die "Architecture not resolved — SIDECAR variable is empty"

  # Use the platform-specific darwin binary (NOT find, which picks linux first)
  case "$ARCH" in
    arm64|aarch64) CLI_BIN="$SCRIPT_DIR/packages/opencode/dist/opencode-darwin-arm64/bin/opencode" ;;
    x86_64)        CLI_BIN="$SCRIPT_DIR/packages/opencode/dist/opencode-darwin-x64/bin/opencode" ;;
  esac
  SIDECAR_DIR="$SCRIPT_DIR/packages/desktop/src-tauri/sidecars"
  SIDECAR_PATH="$SIDECAR_DIR/$SIDECAR"

  if [[ ! -f "$CLI_BIN" ]]; then
    die "CLI binary not found at $CLI_BIN — build CLI first (run without --dmg-only)"
  fi

  # Verify it's Mach-O before placing as sidecar
  if ! file "$CLI_BIN" | grep -q "Mach-O"; then
    die "Sidecar binary is wrong format ($(file -b "$CLI_BIN")) — expected Mach-O for macOS"
  fi

  mkdir -p "$SIDECAR_DIR"
  cp "$CLI_BIN" "$SIDECAR_PATH"
  chmod +x "$SIDECAR_PATH"
  log "Sidecar placed: $SIDECAR_PATH (Mach-O ✓)"

  # --- Step 6: Build DMG ---
  header "Step 6: Building DMG (Rust release — this takes 5-15 minutes)"
  cd "$SCRIPT_DIR/packages/desktop/src-tauri"

  CONF="tauri.conf.json"
  CONF_ORIG_CMD=$(python3 -c "import json; print(json.load(open('$CONF'))['build']['beforeBuildCommand'])" 2>/dev/null || echo "")
  if [[ -n "$CONF_ORIG_CMD" ]]; then
    python3 -c "
import json
with open('$CONF') as f:
    cfg = json.load(f)
cfg['build']['beforeBuildCommand'] = 'echo skipped'
with open('$CONF','w') as f:
    json.dump(cfg, f, indent=2)
"
    CONF_PATCHED=true
    info "Patched beforeBuildCommand (trap will restore on exit)"
  fi

  STARTED=$(date +%s)
  info "Compiling Rust release build..."
  cargo tauri build --bundles dmg 2>&1
  ELAPSED=$(( $(date +%s) - STARTED ))

  # Restore immediately (trap also handles abnormal exit)
  restore_conf
  trap - EXIT

  # Find DMG
  DMG=$(find target/release/bundle/dmg -name "*.dmg" -type f 2>/dev/null | head -1)
  if [[ -n "$DMG" ]]; then
    DMG="$SCRIPT_DIR/packages/desktop/src-tauri/$DMG"
    DMG_SIZE=$(du -sh "$DMG" | cut -f1)
    log "DMG built: $DMG ($DMG_SIZE) in ${ELAPSED}s"
  else
    warn "DMG file not found in expected location"
    find target/release/bundle -name "*.dmg" -o -name "*.app" 2>/dev/null | head -5
  fi
else
  header "Steps 4-6: Skipping DMG Build (--cli-only)"
fi

# --- Summary ---
header "Build Complete"
echo "Finished: $(date)"
echo ""

if [[ "$CLI_ONLY" == false && -n "${DMG:-}" ]]; then
  log "DMG: $DMG"
  info "Install: open \"$DMG\""
fi

if [[ "$DMG_ONLY" == false ]]; then
  case "$ARCH" in
    arm64|aarch64) CLI_SHOW="$SCRIPT_DIR/packages/opencode/dist/opencode-darwin-arm64/bin/opencode" ;;
    x86_64)        CLI_SHOW="$SCRIPT_DIR/packages/opencode/dist/opencode-darwin-x64/bin/opencode" ;;
  esac
  log "CLI: $CLI_SHOW"
  info "Install CLI: cp \"$CLI_SHOW\" /usr/local/bin/opencode"
fi

echo ""
log "Full log: $LOG"

# --- Auto-install if requested or prompt ---
if [[ "$DMG_ONLY" == false && -n "${CLI_BIN_BUILD:-}" ]]; then
  info "Install CLI globally? (copies to /usr/local/bin/opencode)"
  printf "  [y/N] " > /dev/tty 2>/dev/null
  read -r response < /dev/tty 2>/dev/null || response="n"
  if [[ "$response" =~ ^[Yy]$ ]]; then
    sudo cp "$SCRIPT_DIR/packages/opencode/$CLI_BIN_BUILD" /usr/local/bin/opencode
    sudo chmod +x /usr/local/bin/opencode
    log "CLI installed: $(which opencode) → $(opencode --version 2>&1 | head -1)"
  fi
fi

if [[ "$CLI_ONLY" == false && -n "${DMG:-}" ]]; then
  info "Open DMG for installation?"
  printf "  [y/N] " > /dev/tty 2>/dev/null
  read -r response < /dev/tty 2>/dev/null || response="n"
  if [[ "$response" =~ ^[Yy]$ ]]; then
    open "$DMG"
    log "DMG opened — drag to Applications to install"
  fi
fi
