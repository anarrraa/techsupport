# Commands

Status column: **ran** = executed on 2026-10-13 with the result shown;
**UNVERIFIED** = needs credentials or sends to external services, not run.

| Task | Command | Status |
| --- | --- | --- |
| Install | `npm ci` | not re-run (lockfile unchanged) |
| All tests | `npm test` | ran: 171 pass, 0 fail |
| One test file | `node --test tests/lib/sla.test.ts` | ran: pass |
| Tests by name | `node --test --test-name-pattern="dry run" tests/workflows/jira-teams-reminder.test.ts` | ran: 2 pass |
| Typecheck | `npm run typecheck` | ran: exit 0 |
| Build | `npm run build` → `dist/server.mjs` | ran: ok |
| Toolchain pin check | `node scripts/verify-toolchain.mjs` | ran: **exit 1** locally (Node 26 vs pinned 22.19.0) — see [gotchas.md](gotchas.md) |
| Run the workflow locally | `REMINDER_DRY_RUN=true npm run remind` | UNVERIFIED (needs Jira creds in `.env`) |
| Live run | `npm run remind` | UNVERIFIED — **posts to Teams**; ask first |
| Explain a run with names | `npm run trace` / `npm run trace -- --allowlist` | UNVERIFIED (live Jira; sends nothing, `scripts/trace-run.ts:2-11`) |
| Prove bot transport | `npm run verify:bot -- <entra-object-id>` | UNVERIFIED — **sends a real DM** |
| Fill Entra ids in directory | `npm run resolve:ids` | UNVERIFIED (needs Graph `User.Read.All`) |
| Build Teams app zip | `npm run package:teams` → `packages/*.zip` | UNVERIFIED |
| Seed escalation state | `ESCALATION_SEED_ONLY=true npm run remind` (dry-run unset) | UNVERIFIED — writes state; refuses with dry-run (`src/workflows/jira-teams-reminder.ts:335`) |

Required before claiming done (`AGENTS.md`): `npm test && npm run typecheck && npm run build`.
CI also runs `node scripts/verify-toolchain.mjs` first, so a local pass on a
non-pinned Node is not CI evidence.

No lint or formatter is configured (`package.json` has no such script).

## Test runner notes

- `node:test` + `node:assert/strict`, no framework (`tests/lib/sla.test.ts:1-2`).
- Node runs `.ts` directly (type stripping); imports keep the `.ts` extension
  (`tsconfig.json:8` `allowImportingTsExtensions`).
- `npm test` globs only `tests/lib/*.test.ts tests/workflows/*.test.ts`
  (`package.json` `scripts.test`). A test in any other folder is silently not run.

## CI

- `.github/workflows/ci.yml`: test, typecheck, build on push/PR.
- `.github/workflows/jira-teams-reminder.yml`: cron `0 1 * * 1-5` and `0 6 * * 1-5`
  UTC (`:18-19`) = 09:00/14:00 Ulaanbaatar; `workflow_dispatch` inputs `dry_run`,
  `seed_only`. Inspect with `gh run list --workflow jira-teams-reminder.yml`.
