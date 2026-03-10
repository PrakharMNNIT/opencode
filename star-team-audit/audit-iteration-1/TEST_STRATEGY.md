# 🧪 Test Strategy — packages/desktop

## Current State
- **Overall coverage**: ~8% (20 Rust unit tests, 0 frontend tests)
- **Target coverage**: 50% by end of Q1, 70% by end of Q2

## Test Pyramid

```
       /\
      /E2E\  (10%) — packages/app/e2e/ covers user journeys
     /------\
    / Integ \  (20%) — IPC command roundtrip, sidecar lifecycle
   /----------\
  /   Unit    \  (70%) — Rust logic, TS components, pure functions
 /--------------\
```

## Phase 1: Security-Critical Tests (Week 1) — 0.5 pd

| Test | File | Type | Priority |
|------|------|------|----------|
| Markdown sanitization: `<script>` stripped | markdown.rs | Unit | P0 |
| Markdown sanitization: `onerror` stripped | markdown.rs | Unit | P0 |
| wsl_path: `$()` in path rejected/escaped | lib.rs | Unit | P0 |
| wsl_path: backtick in path rejected/escaped | lib.rs | Unit | P0 |
| Health check with malformed URL | server.rs | Unit | P0 |

## Phase 2: Rust Unit Tests (Week 2-3) — 2 pd

| Test | File | Type |
|------|------|------|
| WSL config read/write roundtrip | server.rs | Unit |
| normalize_hostname_for_url edge cases (IPv6, wildcard) | server.rs | Unit |
| check_health with localhost vs remote | server.rs | Unit |
| shell_escape with special characters | cli.rs | Unit |
| get_sidecar_port fallback to random | lib.rs | Unit |
| opencode_db_path on each platform | lib.rs | Unit |
| Log file cleanup older than 7 days | logging.rs | Unit |
| Log tail with empty/missing file | logging.rs | Unit |
| Markdown link rendering (external link attrs) | markdown.rs | Unit |
| is_localhost_url with various inputs | server.rs | Unit |

## Phase 3: Frontend Tests (Week 3-4) — 2 pd

**Framework**: vitest + @solidjs/testing-library + happy-dom

| Test | File | Type |
|------|------|------|
| ServerGate renders loading state | index.tsx | Component |
| ServerGate handles error state | index.tsx | Component |
| Storage flush on pagehide | index.tsx | Unit |
| Storage getItem returns pending writes | index.tsx | Unit |
| Console bridge batches non-error messages | console-bridge.ts | Unit |
| Console bridge sends errors immediately | console-bridge.ts | Unit |
| Console bridge filters noisy warnings | console-bridge.ts | Unit |
| Zoom clamping at MIN/MAX boundaries | webview-zoom.ts | Unit |
| Loading screen phase transitions | loading.tsx | Component |
| i18n initialization order | loading.tsx | Integration |

## Phase 4: IPC Integration Tests (Week 5) — 2 pd

**Framework**: Tauri test utilities

| Test | Command | Validates |
|------|---------|-----------|
| kill_sidecar when no server running | kill_sidecar | Graceful no-op |
| install_cli on non-unix | install_cli | Returns error |
| get/set_default_server_url roundtrip | get/set_default_server_url | Store persistence |
| get/set_wsl_config roundtrip | get/set_wsl_config | Store persistence |
| check_app_exists with known app | check_app_exists | Platform detection |
| parse_markdown with safe content | parse_markdown_command | HTML output |
| parse_markdown with unsafe content | parse_markdown_command | Sanitization |
| log_webview with each level | log_webview | Correct tracing level |

## CI/CD Integration

```yaml
# Proposed GitHub Actions job
test-desktop:
  runs-on: ${{ matrix.os }}
  strategy:
    matrix:
      os: [ubuntu-latest, macos-latest, windows-latest]
  steps:
    - uses: actions/checkout@v4
    - run: cargo test --manifest-path packages/desktop/src-tauri/Cargo.toml
    - run: bun test --cwd packages/desktop
    - run: cargo audit --manifest-path packages/desktop/src-tauri/Cargo.toml
```

## Quality Gates
- [ ] All P0 security tests passing before merge
- [ ] Rust coverage ≥ 40%
- [ ] Frontend coverage ≥ 30%
- [ ] `cargo audit` clean
- [ ] No new `unsafe` blocks without safety comments

## Tools
| Tool | Purpose |
|------|---------|
| `cargo test` | Rust unit tests |
| `cargo tarpaulin` | Rust coverage |
| `vitest` | TypeScript unit/component tests |
| `happy-dom` | DOM simulation for SolidJS |
| `cargo audit` | Dependency vulnerability scanning |
