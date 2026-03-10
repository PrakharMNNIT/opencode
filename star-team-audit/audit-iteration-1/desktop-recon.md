## Architecture Summary

Tauri v2 desktop application (Rust backend + SolidJS/TypeScript frontend) that wraps an `opencode` CLI server as a sidecar process. The Rust side handles window management, sidecar lifecycle, health checks, CLI installation/sync, Linux display backend detection (Wayland/X11), markdown rendering, and IPC commands. The frontend connects to the local server, manages deep links, updates, zoom, menus, and bridges console output to Rust logging.

## Risk Map (from triage + manual review)

### CRITICAL PRIORITY
- src-tauri/src/server.rs — Server spawning, health checks, credential handling, external URL input
- src-tauri/src/cli.rs — Command spawning, shell injection surface, WSL script generation, sidecar management
- src-tauri/src/lib.rs — App initialization, server connection orchestration, unsafe env mutation
- src-tauri/src/main.rs — Startup, unsafe env var manipulation, proxy bypass

### HIGH PRIORITY
- src-tauri/src/os/windows.rs — Registry access, command execution, path resolution
- src/index.tsx — Platform bridge, storage, fetch, deep links, clipboard image
- src-tauri/src/windows.rs — Window creation, browser args injection
- src/updater.ts — Update download + install flow
- src-tauri/src/markdown.rs — HTML rendering with unsafe mode enabled
- src/webview-zoom.ts — Zoom control, IPC invoke

### MEDIUM PRIORITY
- src/console-bridge.ts — Console override, IPC batching
- src/cli.ts — CLI install UI
- src/menu.ts — macOS menu creation
- src/entry.tsx — Entry point routing
- src/loading.tsx — Loading screen
- src-tauri/src/logging.rs — Log file management
- src-tauri/src/linux_display.rs — Display config read/write
- src-tauri/src/linux_windowing.rs — Backend selection logic
- src-tauri/src/window_customizer.rs — Pinch zoom disable
- src-tauri/src/constants.rs — Constants
- src/bindings.ts — Auto-generated bindings
- vite.config.ts — Build config
- sst-env.d.ts — Type declaration
- src-tauri/build.rs — Build script

### CONTEXT-ONLY
(none — no test files in scan target besides inline #[cfg(test)] blocks)

## Detected Patterns
- Framework: Tauri v2 (Rust) + SolidJS (TypeScript) | Auth: Basic auth (username/password) for sidecar | DB: SQLite (via sidecar CLI) | Build: Vite + Cargo
- Key dependencies: tauri, tauri-specta, reqwest, comrak, tokio, process-wrap, solid-js, @tauri-apps/*
- Unsafe code: env::set_var in main.rs and lib.rs (pre-thread safety comments)
- Shell execution: spawn_command builds shell commands with string interpolation
- WSL support: generates bash scripts with shell_escape

## Service Boundaries
Single-service desktop application with embedded sidecar server.

## File Metrics & Context Budget
Confirmed from triage: FILE_BUDGET=60, totalFiles=46, scannableFiles=25, strategy=parallel

## Threat model
No threat model — using default boundary detection.

## Recommended scan order
server.rs → cli.rs → lib.rs → main.rs → os/windows.rs → index.tsx → windows.rs → updater.ts → markdown.rs → webview-zoom.ts → console-bridge.ts → cli.ts → menu.ts → entry.tsx → loading.tsx → logging.rs → linux_display.rs → linux_windowing.rs → window_customizer.rs → constants.rs → bindings.ts → vite.config.ts → sst-env.d.ts → build.rs
