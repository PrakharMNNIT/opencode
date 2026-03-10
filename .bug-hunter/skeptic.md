# Skeptic Challenge Report — packages/desktop

---

**BUG-1** | Original: 10 pts
- **Code reviewed:** src-tauri/src/markdown.rs (full), src/bindings.ts, src/index.tsx (parseMarkdown usage)
- **Runtime trigger test:** The claim is that arbitrary HTML/JS can execute. I traced the flow: `parseMarkdownCommand` is a Tauri IPC command called from the webview. The webview sends markdown → Rust parses it with comrak `unsafe=true` → returns HTML string → webview inserts it into DOM. The key question: does comrak `unsafe=true` pass `<script>` tags? Per comrak docs, `unsafe=true` means "render raw HTML blocks and inline HTML". So yes, `<script>alert(1)</script>` in markdown input WOULD appear in the output HTML. However, the actual XSS risk depends on HOW the HTML is inserted into the DOM. If the frontend uses `innerHTML` it's exploitable; if it uses `textContent` or a sanitizer, it's not. Looking at index.tsx:259, `parseMarkdown` is exposed on the platform object — it's used by the app package for rendering markdown. The rendered HTML is almost certainly inserted via `innerHTML` or equivalent (that's the whole point of a markdown→HTML function). This is a real XSS vector.
- **Counter-argument:** None strong enough. The `unsafe=true` is intentional to support raw HTML in markdown (common for documentation), but it does create a real XSS surface when processing untrusted content.
- **Evidence:** comrak docs confirm `unsafe` allows raw HTML passthrough. The `ExternalLinkFormatter` adds `target="_blank" rel="noopener noreferrer"` to links but does NOT sanitize other HTML elements.
- **Confidence:** 85%
- **Risk calc:** EV = (85% × 10) - (15% × 20) = 8.5 - 3.0 = +5.5
- **Decision:** ACCEPT

---

**BUG-2** | Original: 10 pts
- **Code reviewed:** src-tauri/src/cli.rs (lines 250-300), src-tauri/src/server.rs (serve, get_server_url_from_config, normalize_hostname_for_url)
- **Runtime trigger test:** Let me trace the hostname flow carefully. In `serve()` (cli.rs:352), hostname comes from `spawn_local_server()` in server.rs:103, which is called from `setup_server_connection()` in lib.rs:310 with `hostname = "127.0.0.1"` (hardcoded). The hostname in `serve()` is ALWAYS `"127.0.0.1"` for the local sidecar — it's NOT from user config. The user config hostname flows through `get_server_url_from_config` → `get_saved_server_url` → used in `check_health` (read-only HTTP GET), NOT in `spawn_command`. The WSL script path gets `args` from `serve()` which formats: `"--print-logs --log-level WARN serve --hostname {hostname} --port {port}"` — but `hostname` here is the hardcoded `"127.0.0.1"` string, and `port` is a `u32` (can't contain shell metacharacters). HOWEVER: `get_config()` calls `spawn_command(app, "debug config", &[])` — the `args` here is a static string. The only other caller pattern I see is `serve()` with the hardcoded hostname. The WSL code path is Windows-only (`cfg!(windows)`) and requires WSL to be enabled. The actual exploit path requires the hostname to come from user config, but it's hardcoded. The Hunter's claim about config hostname injection is WRONG for the sidecar spawn path.
- **Counter-argument:** The hostname passed to `serve()` is hardcoded as `"127.0.0.1"` in lib.rs:307, and the port is a `u32`. Neither can contain shell metacharacters. The user config's hostname is used only in `get_server_url_from_config` which produces a URL for `check_health` (HTTP GET), not for shell command construction.
- **Evidence:** lib.rs:305-307: `let hostname = "127.0.0.1"; let local_url = format!("http://{hostname}:{local_port}");` and line 316: `server::spawn_local_server(app, hostname.to_string(), local_port, password.clone())`. The hostname is a hardcoded string literal.
- **Confidence:** 90%
- **Risk calc:** EV = (90% × 10) - (10% × 20) = 9.0 - 2.0 = +7.0
- **Decision:** DISPROVE — The hostname in the WSL script comes from a hardcoded `"127.0.0.1"` constant, not from user config. The port is `u32`. Shell injection via hostname/port in the sidecar spawn path is not reachable. (Note: the `args` parameter in `spawn_command` IS string-interpolated into shell, which is a design smell, but the actual callers only pass controlled strings.)

---

**BUG-3** | Original: 10 pts
- **Code reviewed:** src-tauri/src/cli.rs (lines 300-315), src-tauri/src/server.rs (serve), src-tauri/src/lib.rs (setup_server_connection)
- **Runtime trigger test:** Same analysis as BUG-2. The Unix shell path also interpolates `args` into `shell -l -c "sidecar args"`. The callers of `spawn_command` are: (1) `get_config`: `"debug config"` — static string; (2) `serve`: hostname is `"127.0.0.1"` hardcoded, port is `u32`. Same conclusion — callers pass controlled strings. The design IS fragile (string interpolation into shell commands), but the actual attack path described by the Hunter is not reachable since hostname is hardcoded.
- **Counter-argument:** Same as BUG-2. The sidecar path comes from `tauri::process::current_binary()` which is the app's own install path (controlled by OS), and args contain only hardcoded hostname "127.0.0.1" and u32 port. No user-controlled data reaches the shell command in current callers.
- **Evidence:** lib.rs:305: `let hostname = "127.0.0.1";`, lib.rs:316: `server::spawn_local_server(app, hostname.to_string(), local_port, password.clone())`. The password goes through env vars (`OPENCODE_SERVER_PASSWORD`), not through the shell command string.
- **Confidence:** 88%
- **Risk calc:** EV = (88% × 10) - (12% × 20) = 8.8 - 2.4 = +6.4
- **Decision:** DISPROVE — Same reasoning as BUG-2. The args passed to shell are constructed from hardcoded strings and u32 port. However, this IS a latent vulnerability — any future caller that passes user input through `spawn_command` would be exploitable. The design pattern is unsafe, but no current runtime trigger exists.

---

**BUG-4** | Original: 5 pts
- **Code reviewed:** src-tauri/src/main.rs (full)
- **Runtime trigger test:** The `unsafe { env::set_var() }` calls in main.rs happen in `fn main()` before `opencode_lib::run()` which is where Tauri starts the runtime and spawns threads. The code runs sequentially: first `upsert("NO_PROXY")`, then `configure_display_backend()`, then `opencode_lib::run()`. No threads are spawned by user code before these calls. The question is whether the Rust runtime or linked libraries spawn threads before `main()`. In practice, standard Rust programs don't have background threads before `main()` runs. The `#[cfg_attr(not(debug_assertions), windows_subsystem = "windows")]` doesn't spawn threads. The safety comment is accurate for typical Rust programs.
- **Counter-argument:** DISPROVE (Hard exclusion #4: Memory safety issues in memory-safe languages). The `unsafe` block here is for `env::set_var` which became `unsafe` in Rust 1.66+ precisely because of multi-threading concerns. But in this context, no threads are spawned yet — the code runs at the very start of `main()` before Tauri's runtime is initialized. While technically `unsafe`, this is the standard documented pattern for setting env vars early in main().
- **Evidence:** main.rs: `fn main()` → `upsert()` → `configure_display_backend()` → `opencode_lib::run()`. All env mutations happen before `run()`, which is where the tokio runtime and threads are created.
- **Confidence:** 78%
- **Risk calc:** EV = (78% × 5) - (22% × 10) = 3.9 - 2.2 = +1.7
- **Decision:** DISPROVE — Standard Rust pattern for early env var setup. No threads exist at this point in execution. While technically unsafe, the safety invariant (single-threaded context) is upheld.

---

**BUG-5** | Original: 5 pts
- **Code reviewed:** src-tauri/src/server.rs (get_saved_server_url, check_health, check_health_or_ask_retry)
- **Runtime trigger test:** The URL comes from the user's own settings store or config file. The "attacker" who can modify the settings file already has local access to the user's machine. SSRF is typically a server-side vulnerability where an external attacker tricks the server into making requests. Here, the "attacker" IS the user (or someone with file-system access to user's config). This is a desktop app, not a server — the user is the operator.
- **Counter-argument:** This is a desktop application, not a web service. The URL in the settings store is set BY the user (via `setDefaultServerUrl` IPC command or by editing their config file). An attacker who can modify the settings file already has local code execution. SSRF is a server-side attack pattern that doesn't apply to a desktop app where the user controls their own config.
- **Evidence:** The URL is set via `set_default_server_url` (requires IPC from webview) or from the CLI config file (local filesystem). Both require the user's own action or local file access.
- **Confidence:** 85%
- **Risk calc:** EV = (85% × 5) - (15% × 10) = 4.25 - 1.5 = +2.75
- **Decision:** DISPROVE — SSRF doesn't apply to desktop apps where the user controls their own configuration. The threat model assumes the user is the operator, not the attacker.

---

**BUG-6** | Original: 5 pts
- **Code reviewed:** src-tauri/src/lib.rs (wsl_path function, lines 228-252)
- **Runtime trigger test:** The `wsl_path` function is a Tauri IPC command callable from the webview. The path input comes from the frontend JavaScript. In `index.tsx`, it's called as `commands.wslPath(path, "linux")` and `commands.wslPath("~", "windows")`. The `path` comes from the file picker dialog result or from user's `~` tilde. The file picker result comes from Tauri's `open()` dialog, which returns OS-selected paths. However, the `~`-prefix branch does have incomplete escaping — only `"` is escaped, not `$()`, backticks, etc. The question is: can an attacker control the path input? The IPC is exposed to the webview, and the webview loads local content. If there's an XSS (see BUG-1), then an attacker could call `wslPath` with arbitrary input. Even without XSS, the frontend calls `wslPath(result, "linux")` where `result` comes from `open()` dialog — OS file dialog results could contain `$()` in filenames. This is a real shell injection vector accessible from the IPC layer.
- **Counter-argument:** Weak — the path does come from IPC which is accessible from the webview. While the normal flow uses dialog results, the IPC command is exposed and could be called with arbitrary input if the webview is compromised.
- **Evidence:** lib.rs:236: `let escaped = suffix.replace('"', "\\\"");` — only double-quote escaping, no protection against `$()`, backticks, `\n`, etc. The `cmd` string is passed to `sh -lc` which interprets all shell metacharacters.
- **Confidence:** 80% (real bug)
- **Risk calc:** N/A (accepting)
- **Decision:** ACCEPT

---

**BUG-7** | Original: 5 pts
- **Code reviewed:** src-tauri/src/server.rs (get_wsl_config, set_wsl_config)
- **Runtime trigger test:** `get_wsl_config` returns hardcoded `false`. `set_wsl_config` writes to store. `is_wsl_enabled` in cli.rs calls `get_wsl_config(...).is_ok_and(|v| v.enabled)` — this will always be false. BUT: looking at the frontend side, `index.tsx:255` calls `getWslEnabled` which does: `const next = await commands.getWslConfig().catch(() => null); if (next) return next.enabled; return window.__OPENCODE__!.wsl ?? false`. So the frontend first checks the IPC result (always false), then falls back to `window.__OPENCODE__.wsl`. And in windows.rs:55, the MainWindow initialization sets: `window.__OPENCODE__.wsl = {wsl_enabled}` where `wsl_enabled` comes from... `get_wsl_config(app.clone()).ok().map(|v| v.enabled).unwrap_or(false)` — also always false. So WSL is completely non-functional. The setting writes succeed but reads are always false. This is clearly a bug — the commented-out code shows intent to read from store.
- **Counter-argument:** None. The commented-out code clearly shows the intended behavior. This is a regression or intentional disable that breaks the WSL feature.
- **Evidence:** server.rs:63-72: hardcoded return `Ok(WslConfig { enabled: false })`. server.rs:77-88: `set_wsl_config` properly writes to store. The read/write asymmetry is the bug.
- **Confidence:** 95% (real bug)
- **Risk calc:** N/A (accepting)
- **Decision:** ACCEPT

---

**BUG-8** | Original: 5 pts
- **Code reviewed:** src-tauri/src/lib.rs (check_linux_app, check_app_exists)
- **Runtime trigger test:** The stub implementation clearly returns `true` unconditionally. The macOS implementation properly checks app locations and `which`. The Windows implementation in os/windows.rs has full registry + PATH resolution. Only Linux is stubbed out. This is definitely a bug — incomplete implementation.
- **Counter-argument:** None. `check_linux_app` is a stub that needs to be implemented. However, downgrading from "ElevationOfPrivilege" (STRIDE) — this is not a privilege escalation. It's a logic bug that shows apps as available when they may not be. Reclassify as logic bug.
- **Evidence:** lib.rs:156-158: `fn check_linux_app(app_name: &str) -> bool { return true; }` — stub with no logic.
- **Confidence:** 95% (real bug, but severity should be re-evaluated — this is logic, not security)
- **Risk calc:** N/A (accepting)
- **Decision:** ACCEPT (but reclassify from security/ElevationOfPrivilege to logic, likely Low severity)

---

**BUG-9** | Original: 5 pts
- **Code reviewed:** src-tauri/src/cli.rs (install_cli function, lines 130-165)
- **Runtime trigger test:** The temp file path is `std::env::temp_dir().join("opencode-install.sh")`. On most systems this is `/tmp/opencode-install.sh`. The TOCTOU window exists between `write` and `Command::new().output()`. However: (1) The file is written with the correct content, (2) permissions are set to 0o755, (3) `/tmp` typically has the sticky bit set on Linux/macOS meaning only the file owner can modify it. After `write()`, the file is owned by the current user, and on sticky-bit `/tmp`, other users cannot overwrite it. Only another process running as the SAME user could race this, which is a weaker threat model.
- **Counter-argument:** On systems with sticky bit `/tmp` (standard Linux/macOS), only the same user can overwrite the file. The attack requires an attacker already running as the same user, at which point they already have arbitrary code execution. The TOCTOU is real but the practical impact is low.
- **Evidence:** cli.rs:140: `std::env::temp_dir().join("opencode-install.sh")` — predictable path. But sticky bit on /tmp limits the attack to same-user processes.
- **Confidence:** 55% (borderline — real TOCTOU but low practical impact)
- **Risk calc:** EV = (55% × 5) - (45% × 10) = 2.75 - 4.5 = -1.75
- **Decision:** ACCEPT (EV is negative, so safer to accept. The TOCTOU is technically real even if practically limited.)

---

**BUG-10** | Original: 5 pts
- **Code reviewed:** src-tauri/src/cli.rs (lines 263-271)
- **Runtime trigger test:** The `curl | bash` pattern is used to install the opencode CLI inside WSL. The version is shell-escaped. The URL is HTTPS (`https://opencode.ai/install`). HTTPS provides transport security against MITM. DNS poisoning is a real but separate concern. This is a standard software distribution pattern (many tools use `curl | bash` — Homebrew, Rust's rustup, etc.). While there's no hash verification, the HTTPS connection provides integrity. The absence of pinned hashes or GPG signatures is a defense-in-depth concern, not a behavioral bug per se.
- **Counter-argument:** HTTPS provides transport integrity. The `curl -fsSL` pattern with HTTPS is industry-standard for software installation scripts. This is a design decision (same as `curl | bash` used by Homebrew, rustup, etc.), not a behavioral bug. A compromised domain is a threat model issue, not a code bug.
- **Evidence:** cli.rs:268: `curl -fsSL https://opencode.ai/install` — uses HTTPS, not HTTP.
- **Confidence:** 72%
- **Risk calc:** EV = (72% × 5) - (28% × 10) = 3.6 - 2.8 = +0.8
- **Decision:** DISPROVE — HTTPS provides transport security. `curl | bash` with HTTPS is an industry-standard installation pattern. The absence of additional integrity verification (GPG, checksums) is a hardening suggestion, not a runtime bug.

---

**BUG-11** | Original: 1 pt
- **Code reviewed:** src-tauri/src/lib.rs (opencode_db_path, sqlite_file_exists)
- **Runtime trigger test:** On macOS, `~/.local/share` indeed doesn't typically exist. However, the sidecar is spawned with `XDG_STATE_HOME` set but not `XDG_DATA_HOME`. The sidecar determines its own data directory. If the sidecar uses XDG conventions, it would look at `XDG_DATA_HOME` (which the desktop app doesn't set) and fall back to `~/.local/share/opencode/opencode.db`. So the desktop's check (`opencode_db_path`) would match the sidecar's location IF both use the same XDG fallback. On macOS, XDG conventions are not standard but some tools do use them. The bug's impact is: if the sidecar puts the DB elsewhere (e.g., `~/Library/Application Support`), the desktop check looks in the wrong place, causing an unnecessary loading screen. This is a minor UX issue.
- **Counter-argument:** Weak — the analysis is plausible. Both the desktop check and the sidecar may use the same XDG fallback path, making this a non-issue. But if they diverge, it's a minor UX bug (extra loading screen).
- **Evidence:** lib.rs:348-358: uses XDG_DATA_HOME with `~/.local/share` fallback, which may or may not match the sidecar's logic.
- **Confidence:** 50% (uncertain whether the sidecar matches this logic)
- **Risk calc:** EV = (50% × 1) - (50% × 2) = 0.5 - 1.0 = -0.5
- **Decision:** ACCEPT (low confidence, low stakes, safer to accept)

---

**BUG-12** | Original: 1 pt
- **Code reviewed:** src/index.tsx (storage API, lines 105-115)
- **Runtime trigger test:** The `length` getter returns `api.getLength()` which returns `Promise<number>`. The `AsyncStorage` interface from `@solid-primitives/storage` defines `length` as `Promise<number>`, so this is actually correct — it's an async storage interface, not a sync one. Consumers should be using `await storage.length` or `storage.getLength()`.
- **Counter-argument:** The `AsyncStorage` interface expects `length` to return a Promise. This is by design for async storage backends (like Tauri's store). The getter correctly returns a Promise. Any consumer accessing it knows they're using async storage.
- **Evidence:** The type is `AsyncStorage` (imported from `@solid-primitives/storage`), which is an async interface. The `length` property is documented to return `Promise<number>`.
- **Confidence:** 75%
- **Risk calc:** EV = (75% × 1) - (25% × 2) = 0.75 - 0.5 = +0.25
- **Decision:** DISPROVE — The `AsyncStorage` interface is designed with async `length`. This is correct behavior, not a bug.

---

**BUG-13** | Original: 5 pts
- **Code reviewed:** src/index.tsx (ServerGate component, lines 281-300)
- **Runtime trigger test:** Let me trace the SolidJS behavior. `createResource` with an async fetcher starts the fetch immediately. The `if (serverData.state === "errored") throw serverData.error` runs synchronously during component body execution. In SolidJS, the component body runs ONCE during creation. At that point, `serverData.state` is indeed "pending" (the resource hasn't resolved yet). So this `throw` never fires. If initialization fails later, the resource enters "errored" state, but no reactive effect re-checks this condition. The `<Show when={serverData.state !== "pending" && serverData()}>` will remain in the fallback forever because the condition `serverData()` will throw the error inside the reactive scope... actually, in SolidJS, accessing `serverData()` when the resource is errored throws the error, which would propagate to an error boundary. Let me reconsider — SolidJS's `createResource` throws on access when errored. So `serverData()` in the `<Show when>` would throw, which would propagate up. But there's no `<ErrorBoundary>` wrapping `ServerGate`. The error would be uncaught and crash the app. The dead code check on line 283 is still dead code though, and the lack of error boundary IS a problem for error UX.
- **Counter-argument:** Partially correct. The `if (serverData.state === "errored")` check IS dead code (it runs synchronously before the resource can error). However, SolidJS's `createResource` DOES throw when you access `serverData()` in a reactive context while errored, so the `<Show when>` condition would eventually throw. But this would be an uncaught exception (no error boundary), not a graceful error display. The bug is real but the mechanism is slightly different than described.
- **Evidence:** SolidJS docs: "If a resource errors, accessing its value will re-throw the error." The `<Show when={serverData.state !== "pending" && serverData()}>` would throw inside the reactive computation.
- **Confidence:** 70% (real problem — dead code + no error boundary = bad error UX)
- **Risk calc:** N/A (accepting)
- **Decision:** ACCEPT (the dead code check and poor error handling are real issues, even if the exact mechanism differs slightly from the Hunter's description)

---

**BUG-14** | Original: 1 pt
- **Code reviewed:** src/webview-zoom.ts (full)
- **Runtime trigger test:** The zoom signal initializes to 1. On reload, the signal resets. The actual webview zoom level... does it persist across reloads? The zoom is set via `invoke("plugin:webview|set_webview_zoom", { value: next })` which calls into Tauri's webview plugin. Webview zoom typically resets on navigation/reload in WebView2 and WebKitGTK. So the signal and actual zoom would both reset to default — no mismatch. The bug claim is that the webview retains zoom but the signal doesn't. In most webview implementations, zoom resets on reload.
- **Counter-argument:** Webview zoom typically resets on page reload (WebView2/WebKitGTK default behavior). Both the signal and the webview zoom would be at their defaults after reload, so there's no mismatch.
- **Evidence:** webview-zoom.ts: zoom is applied via IPC to the webview plugin. Standard webview behavior is to reset zoom on navigation.
- **Confidence:** 65%
- **Risk calc:** EV = (65% × 1) - (35% × 2) = 0.65 - 0.70 = -0.05
- **Decision:** ACCEPT (borderline — I'm not 100% sure about webview zoom persistence behavior, so safer to accept a 1pt finding)

---

**BUG-15** | Original: 1 pt
- **Code reviewed:** src/console-bridge.ts (full)
- **Runtime trigger test:** The batch has a 100ms timer. On page unload (reload from menu or navigation), pending messages are lost. This is true — there's no unload handler. However, errors go immediately (not batched), and the lost messages are info/warn/debug level only. The impact is minor: some diagnostic log lines may be lost during reload.
- **Counter-argument:** The impact is minimal — only non-error messages are batched and potentially lost. Errors bypass the batch and go immediately. But the claim is technically correct.
- **Evidence:** console-bridge.ts:33: `if (level === "error") { commands.logWebview("error", msg).catch(() => {}); return; }` — errors are immediate. Only info/warn/debug are batched.
- **Confidence:** 60% (real but very low impact)
- **Risk calc:** N/A (accepting low-point finding)
- **Decision:** ACCEPT

---

**BUG-16** | Original: 5 pts
- **Code reviewed:** src-tauri/src/lib.rs (setup_server_connection, initialize)
- **Runtime trigger test:** Let me trace the full flow when a remote server URL is configured. In `setup_server_connection`: (1) `custom_url` is set from config, (2) health check passes for remote server, (3) `is_localhost_url` returns false for remote URL, (4) code falls through, (5) local port is found, (6) local health check fails (no server running yet), (7) sidecar is spawned. The sidecar's URL is sent via `server_ready_tx`. The frontend receives this local URL. So the user configured a remote server but gets connected to... actually, wait. Looking more carefully at `initialize()`: the `server_ready_rx` is what the frontend awaits. This only resolves when the sidecar spawning completes. The custom URL check result is NOT directly communicated to the frontend via `server_ready_tx`. The comment says "Remote default server: fall through and also spawn a local sidecar" — this appears intentional. The app spawns a local sidecar regardless, so the frontend always connects locally. The remote URL check is just a pre-flight verification. Looking at the frontend code in `index.tsx`, `defaultServer` is checked separately via `getDefaultServerUrl`. So the app architecture seems intentional: always spawn a local sidecar + optionally connect to configured servers via the frontend's server selection. The "bug" may be by design.
- **Counter-argument:** The code comment explicitly says "Remote default server: fall through and also spawn a local sidecar." This appears intentional — the architecture always ensures a local sidecar is available, even if a remote server is configured. The frontend handles server selection separately. This is a design decision, not a bug.
- **Evidence:** lib.rs comment: `// Remote default server: fall through and also spawn a local sidecar`. This is documented intentional behavior.
- **Confidence:** 70% (this is intentional design, not a bug)
- **Risk calc:** EV = (70% × 5) - (30% × 10) = 3.5 - 3.0 = +0.5
- **Decision:** DISPROVE — The code comment explicitly documents this as intentional. The architecture always spawns a local sidecar to ensure fallback availability. Server selection is handled by the frontend separately.

---

**BUG-17** | Original: 1 pt
- **Code reviewed:** src/loading.tsx (lines 14-19)
- **Runtime trigger test:** The `lines` array is declared at module top level as `const lines = [t("desktop.loading.status.initial"), ...]`. Then `void initI18n()` is called (fire and forget). The `t()` function's behavior before initialization depends on the i18n library used. If `t()` returns keys or English fallback before init, the `lines` array captures those values permanently (since they're captured by value in the const, not reactively). The `status()` memo inside the component also calls `t("desktop.loading.status.initial")` and `t("desktop.loading.status.done")` — these would be called during render which is AFTER `initI18n` has likely completed (the component renders later in the lifecycle). But the `lines` array is the issue — it captures `t()` results before init and they're never updated. This IS a real i18n bug for non-English locales on the loading screen.
- **Counter-argument:** Weak — the `lines` array genuinely captures pre-init translation values. However, the loading screen is brief and shown only during SQLite migration, so the impact is very limited.
- **Evidence:** loading.tsx:14-16: `const lines = [t("desktop.loading.status.initial"), ...]` at module scope, line 19: `void initI18n()` (async, not awaited before lines are evaluated).
- **Confidence:** 85% (real bug)
- **Risk calc:** N/A (accepting)
- **Decision:** ACCEPT

---

**SUMMARY:**
- Bugs disproved: 6 (BUG-2: 10pts, BUG-3: 10pts, BUG-4: 5pts, BUG-5: 5pts, BUG-10: 5pts, BUG-12: 1pt, BUG-16: 5pts = 41 points claimed)

Wait, I count 7 disproves. Let me recount:
- DISPROVE: BUG-2 (10), BUG-3 (10), BUG-4 (5), BUG-5 (5), BUG-10 (5), BUG-12 (1), BUG-16 (5) = 7 disproved, 41 points claimed
- ACCEPT: BUG-1, BUG-6, BUG-7, BUG-8, BUG-9, BUG-11, BUG-13, BUG-14, BUG-15, BUG-17 = 10 accepted

- Bugs disproved: 7 (total points claimed: 41)
- Bugs accepted as real: 10

**Files read during review:**
- src-tauri/src/markdown.rs
- src-tauri/src/cli.rs
- src-tauri/src/server.rs
- src-tauri/src/lib.rs
- src-tauri/src/main.rs
- src/index.tsx
- src/webview-zoom.ts
- src/console-bridge.ts
- src/loading.tsx
- src/bindings.ts

**ACCEPTED BUG LIST:**
- BUG-1 | Critical | src-tauri/src/markdown.rs | XSS via unsafe markdown rendering
- BUG-6 | Medium | src-tauri/src/lib.rs | Shell injection in wsl_path
- BUG-7 | Medium | src-tauri/src/server.rs | WSL config always returns false (broken feature)
- BUG-8 | Medium | src-tauri/src/lib.rs | check_linux_app stub always returns true
- BUG-9 | Medium | src-tauri/src/cli.rs | TOCTOU in install_cli temp file
- BUG-11 | Low | src-tauri/src/lib.rs | DB path may be wrong on macOS
- BUG-13 | Medium | src/index.tsx | Dead error check + no error boundary in ServerGate
- BUG-14 | Low | src/webview-zoom.ts | Zoom state not persisted
- BUG-15 | Low | src/console-bridge.ts | Batch not flushed on unload
- BUG-17 | Low | src/loading.tsx | i18n translations captured before init
