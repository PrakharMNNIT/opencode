# 📊 Slide Deck Outline — Desktop Package Audit

## Slide 1: Executive Summary
- **Package**: opencode/packages/desktop (Tauri v2)
- **Health**: 🟡 Yellow — 1 critical security issue, low test coverage
- **Source files**: 25 (5,645 LOC across Rust + TypeScript)
- **Issues found**: 30 total (1 Critical, 7 Medium, 22 Low)
- **Time to production-ready**: ~26 person-days

## Slide 2: Architecture Overview
- Mermaid diagram: Tauri Rust backend ↔ SolidJS webview ↔ Sidecar CLI
- Strengths: Modern stack, type-safe IPC, async architecture
- Scores: Maintainability 7/10, Performance 8/10, Security 5/10, Testability 3/10

## Slide 3: Critical Security Finding
- **XSS via markdown rendering** (CVSS 8.7)
- comrak `unsafe=true` passes raw HTML to webview
- Attacker-controlled content can execute JS in Tauri context
- Fix: Add ammonia sanitizer (0.5 person-days)

## Slide 4: Top Issues by Category
| Category | Count | Key Issue |
|----------|-------|-----------|
| Security | 3 | XSS, shell injection, TOCTOU |
| Logic Bugs | 4 | WSL broken, Linux stub, dead code, i18n timing |
| Code Quality | 6 | Large files, missing tests, docs gaps |
| Testing | 22 | ~8% coverage, 0 frontend tests |
| Documentation | 12 | No architecture docs, no IPC reference |

## Slide 5: Risk Matrix
```
HIGH IMPACT + QUICK FIX → BUG-1 (XSS), BUG-7 (WSL)
HIGH IMPACT + LONG FIX → ErrorBoundary, Testing gaps
LOW IMPACT + QUICK FIX → Linux stub, i18n, batch flush
LOW IMPACT + LONG FIX → Refactoring, documentation
```

## Slide 6: Test Coverage Gap
- Current: ~8% (20 Rust tests, 0 frontend)
- Target: 50% by end of sprint 4
- Critical paths untested: markdown rendering, shell commands, error handling

## Slide 7: Implementation Roadmap
```
Week 1:    ████ P0 Security Fix (XSS)
Week 2-3:  ████████ P1 Fixes (shell injection, WSL, ErrorBoundary, CSP)
Week 4-7:  ████████████ P2 Quality (tests, refactoring, docs)
```
- Total effort: 26 person-days
- Recommended team: 1 Rust engineer + 1 frontend engineer

## Slide 8: Resource Requirements
- 1 Rust/backend engineer (security fixes, test coverage)
- 1 Frontend engineer (ErrorBoundary, component tests)
- Estimated cost: 26 pd × rate

## Slide 9: Success Metrics
- Zero critical vulnerabilities by Week 1
- 50%+ test coverage by Week 7
- All P0/P1 issues resolved by Week 3
- Architecture documentation complete by Week 7

## Slide 10: Next Steps
1. Immediate: Fix XSS in markdown.rs (P0)
2. This sprint: Shell injection fix, WSL config, ErrorBoundary
3. Next sprint: Test coverage, documentation, refactoring
4. Q2: Audit iteration 2 to verify fixes and find regressions
