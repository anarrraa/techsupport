# Phase 2 — Restructure

Kind: code. Roadmap: items 2.1-2.3.

Scope: backend feature folders (`src/shared`, `reminder`, `escalation`,
`monthly-report`, `support-report`); frontend `features/` + `shared/`;
frontend uses `import type` from backend pure files instead of copies.
No behavior change. `agents/` and `workflows/` stay where Flue finds them.

Done when: after each item, test counts match the pre-move run and typecheck/build
pass (root and frontend); all `src/lib/...` paths in `AGENTS.md` and
`for-agents/` are updated.
