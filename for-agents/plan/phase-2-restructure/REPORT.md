# Phase 2 — Restructure: report

Date: 2026-11-06 · Agent: claude · Branch: `orch/p2-restructure`

## Delivered
- 2.1 Backend feature folders: `src/{shared,reminder,escalation,monthly-report,support-report}/`;
  `src/lib/` removed; tests mirror; adapter rule in `AGENTS.md`. [report](reports/2026-11-06-2.1.md)
- 2.2 Frontend `features/{monthly-report,support-report,reports-archive,chat,teams}/` + `shared/`.
  [report](reports/2026-11-06-2.2.md)
- 2.3 Frontend imports `MonthlyMetrics`, `CaptureCoverage`, `Period` as types from the
  backend's pure files; copies deleted. [report](reports/2026-11-06-2.3.md)

Test counts unchanged at every step: root 172 tests / 171 pass / 0 fail / 1 skipped;
frontend 12 / 12 pass. Root typecheck + build and frontend build exit 0 after each item.

## Left open
- `src/backend/db.ts` stays in `backend/` (health check + future docs-chat share the Prisma client).
- `src/shared/config.ts` depends on `src/reminder/delivery-windows.ts`.
- Frontend `toMonthlyReport` duplicates the server's dashboard mapping and is dead in the app (2.3 report).
- `components.json` `hooks` alias points at a removed folder.
- Opt-in DB test not run (no database in the worktree). No browser check.
