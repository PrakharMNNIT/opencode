# OpenCode: Build from Scratch Guide

**Platform:** macOS (Apple Silicon / Intel)
**Output:** CLI binary + Desktop DMG

---

## Prerequisites

```bash
# 0. Xcode Command Line Tools (needed for Rust linker)
xcode-select --install

# 1. Install Bun (JavaScript runtime)
curl -fsSL https://bun.sh/install | bash

# 2. Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup default stable

# 3. Install Tauri CLI
cargo install tauri-cli

# 4. Verify
bun --version    # should be 1.x+
cargo --version  # should be 1.70+
cargo tauri --version
python3 --version
```

---

## Clone & Setup

```bash
# Clone the repo
git clone https://github.com/PrakharMNNIT/opencode.git
cd opencode
git checkout prax-dev

# Install all dependencies (JS + native)
bun install
```

---

## Build the CLI

```bash
cd packages/opencode
bun run build
cd ../..

# Verify CLI works
./packages/opencode/dist/opencode --version
```

**To install CLI globally:**
```bash
cp packages/opencode/dist/opencode /usr/local/bin/opencode
opencode --version
```

---

## Build the Desktop App (DMG)

### Step 1: Build the frontend

```bash
cd packages/desktop
bunx vite build
```

### Step 2: Place the CLI sidecar

Tauri bundles the CLI binary inside the app. It expects it at a specific path:

```bash
mkdir -p src-tauri/sidecars
# Apple Silicon:
cp ../opencode/dist/opencode src-tauri/sidecars/opencode-cli-aarch64-apple-darwin
# Intel (use this instead if on x86_64):
# cp ../opencode/dist/opencode src-tauri/sidecars/opencode-cli-x86_64-apple-darwin
chmod +x src-tauri/sidecars/opencode-cli-*
```

### Step 3: Build the DMG

```bash
cd src-tauri
cargo tauri build --bundles dmg
```

This takes **5-15 minutes** (Rust release compilation).

### Step 4: Install

```bash
# DMG is at:
open target/release/bundle/dmg/

# Double-click the .dmg, drag "OpenCode Prax-Dev" to Applications
```

---

## Quick Reference (Copy-Paste)

```bash
# Everything in one go (after prerequisites):
git clone https://github.com/PrakharMNNIT/opencode.git && cd opencode
git checkout prax-dev && bun install

# Or just use the build script:
./buildFromScratch.sh

# Manual step-by-step (all paths from repo root):
cd packages/opencode && bun run build && cd ../..
cd packages/desktop && bunx vite build
mkdir -p src-tauri/sidecars
cp ../opencode/dist/opencode src-tauri/sidecars/opencode-cli-$(uname -m | sed 's/arm64/aarch64/')-apple-darwin
chmod +x src-tauri/sidecars/opencode-cli-*
cd src-tauri && cargo tauri build --bundles dmg

# Install — DMG is at:
open packages/desktop/src-tauri/target/release/bundle/dmg/
```

---

## Troubleshooting

| Error | Fix |
|-------|-----|
| `tsgo: command not found` | Skip typecheck: use `bunx vite build` instead of `bun run build` for frontend |
| `sidecar doesn't exist` | You forgot Step 2 — copy CLI to sidecars folder |
| `Cannot find package 'vite'` | Run `bun install` from the repo root first |
| Rust compilation slow | First build downloads + compiles all deps (~15min). Subsequent builds are faster (~2min) |
| `cargo tauri: command not found` | Run `cargo install tauri-cli` |

---

## Dev Mode (No DMG, faster iteration)

```bash
# Terminal 1: Backend
cd packages/opencode
bun run --conditions=browser ./src/index.ts serve --port 4096

# Terminal 2: Frontend
cd packages/app
bun dev -- --port 4444

# Open http://localhost:4444
```
