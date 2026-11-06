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
- Review #6 (needs user OK to delete a file): `src/escalation/ticket-digest.ts` — dead
  module (no importer/test); header points at nonexistent `src/agents/digest-writer.ts`.
  Reviewer fix: "delete module or fix comment."
- Review #9: `frontend/src/features/monthly-report/monthly-metrics.ts` + `frontend/src/types/report.ts` —
  `toMonthlyReport` is a dead duplicate of the `server.ts` inline mapping; `MonthlyReport` body
  type still hand-copied and drifts (`avgFirstResponseMinutes` shape, missing `priorityTotals`).
  Reviewer fix: "extract pure `toDashboardReport` into src/monthly-report/monthly-report.ts, call
  from server.ts, `import type ReturnType` in frontend, delete copy."
- Review #10: `frontend/src/shared/utils/report-requests.ts` — `loadArchive` fetches 12 months
  sequentially (up to 180s). Reviewer fix: "Promise.all, drop unused `active` param."
- Opt-in DB test not run (no database in the worktree). No browser check.
- CI frontend step added but not yet run on GitHub (runs on the next PR/push).

## Review fixes (2026-11-06)
Review: CHANGES-REQUESTED, findings #1-#5, #7, #8, #11 fixed in commit "Address phase 2 review".
- #1 `.github/workflows/ci.yml` — new step: `npm ci` + `npm run build` (`tsc --noEmit && vite build`) in `frontend/`.
- #2 `frontend/tsconfig.json` `paths` `@backend/*` → `../src/*`; the three backend type imports use it.
  Type-only, so vite needs no alias; vite build exit 0.
- #3 `for-agents/BACKEND-SETUP.md` — headings/imports point at shipped files, banner marks the code
  blocks as the original plan. `grep src/lib` over `for-agents/` + `AGENTS.md`: only roadmap 2.1 text
  that names the old folder as history.
- #4 `frontend/components.json` `hooks` → `@/shared` (exists). `components`, `ui`, `lib`, `utils` already real.
- #5 root `test` → `node --test "tests/**/*.test.ts"`; 21 test files found either way, same 172 tests.
- #7 line numbers removed from file refs in `conventions.md`, `gotchas.md`, `architecture.md`;
  the stale "digest goes to the wrong agent" gotcha replaced (workflow no longer calls any digest);
  conventions example now cites `reminder-intro.ts` / `reminder-writer.ts`.
- #8 `delivery-windows.ts` (+ test) moved whole to `src/shared/` with `git mv` — no code change;
  `src/shared/` now imports nothing from feature folders.
- #11 `src/support-report/pdf.ts` font paths use `fileURLToPath(new URL(...))`.

Counts after the fixes:
- root `npm test` → tests 172 / pass 171 / fail 0 / skipped 1; `npm run typecheck` exit 0; `npm run build` exit 0
- frontend `npm test` → tests 12 / pass 12 / fail 0 / skipped 0; `npm run typecheck` exit 0; `npm run build` exit 0
- `frontend/dist/assets/*.js` contains no backend symbols (type-only imports).
