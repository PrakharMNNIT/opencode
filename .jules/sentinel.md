## 2025-02-25 - Bun.serve default bindings

**Vulnerability:** Ephemeral local HTTP servers used for OAuth callbacks (`packages/opencode/src/mcp/oauth-callback.ts` and `packages/opencode/src/plugin/codex.ts`) were omitting the `hostname` parameter in `Bun.serve`. This causes the server to bind to `0.0.0.0` (all interfaces) by default instead of `127.0.0.1` (localhost).

**Learning:** In a local-first application, assuming `Bun.serve` binds to localhost by default is a critical mistake. It binds to all network interfaces, exposing local OAuth flows, webhooks, or inter-process communication servers to the entire local network, which breaks the local-only security boundary.

**Prevention:** Every time `Bun.serve` is used to spawn a local server, `hostname: "127.0.0.1"` MUST be explicitly passed to prevent exposing the service to the network, unless mDNS or explicit external networking is intentionally enabled and authenticated.
