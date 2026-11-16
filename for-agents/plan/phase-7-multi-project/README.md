# Phase 7 — Multi-project reminders (DC + SHT + APUT)

Kind: human (directory data, contract answers) + small code/config. Roadmap: phase table row 7.

Goal: the reminder/escalation workflow covers the three Jira Service Management
projects `DC`, `SHT` (Shunkhlai Ticket) and `APUT` (APU Ticket) in one run.

Done when: one scheduled run scans all three projects, every breached request
resolves at least one vendor participant, and no escalation contact or SLA
threshold is guessed.

No names, emails, account ids or object ids in this file or its reports (public repo).
They live only in the gitignored `config/escalation.json` and the
`ESCALATION_DIRECTORY_JSON` secret.

## Read-only findings (2026-11-10, via Jira JQL)

| Project | Type | Open | First-response breached, running, unpaused | Breached ever | Vendor participants missing from directory |
| --- | --- | --- | --- | --- | --- |
| DC | service_desk | — | 13 | — | 1 |
| SHT | service_desk | 37 | 0 | 35 | 6 (one also on DC) |
| APUT | service_desk | 4 | 0 | 1 | 2 |

- Other "APU" projects (`AFAS`, `ARPI`, `ARS`) are software/business projects
  with no JSM SLAs; out of scope.
- `"Time to first response" = breached()` resolves on SHT and APUT, so the SLA
  name is shared. `Time to resolution` is not yet checked on SHT/APUT.
- Client-side (`customer`) participants are dropped by `src/shared/jira.ts`; they
  never need directory entries.

## What the code already supports

- Escalation contacts are per project: `config.projects[<KEY>].L2..L5`
  (`contactFor` in `src/escalation/escalation-config.ts`). A project with no
  entry throws "No L<n> escalation contact configured for project <KEY>" —
  visible, not silent.
- Project scope is the `JIRA_JQL` GitHub variable. No code change to widen it.

## Gaps

1. **Thresholds are global.** `FIRST_RESPONSE_MINUTES` and `LEVEL_MINUTES` in
   `src/escalation/escalation.ts` come from the DC contract (`sla-matrix.md`).
   If Shunkhlai or APU contracts differ, they need per-project tables.
2. **Directory.** SHT and APUT have no `projects` entry; 8 distinct vendor
   participants are missing; the 3 support-team entries still lack Entra ids.
3. **Backlog flood.** SHT requests already past their resolution marks would
   escalate on the first run (the state cache has never seen them).

## Steps

| # | Step | Owner | Acceptance |
| --- | --- | --- | --- |
| 7.1 | Confirm Shunkhlai and APU contract SLA + escalation timelines (first response, resolution, L2-L5 marks, priority mapping). Same as DC → no code; different → record them in `sla-matrix.md` per project. | User / client contract | Answer recorded in `sla-matrix.md` |
| 7.2 | If 7.1 differs: make `firstResponseMinutes` / `dueLevel` / `nextLevel` take the project's table, keyed by project, failing visibly for an unknown project. Tests per project. | Code | `npm test`, typecheck, build green |
| 7.3 | Check `Time to resolution` exists on SHT and APUT (JQL `"Time to resolution" = running()` count > 0 or one SLA call) | Agent, read-only | Recorded in the 7.3 report |
| 7.4 | Add the 8 missing vendor participants to `config/escalation.json` (Jira account id from Jira; email from the user; Entra id via `npm run resolve:ids` or Microsoft 365 lookup) | Agent + user (emails) | `loadEscalationConfig` loads the file |
| 7.5 | Add `projects.SHT` and `projects.APUT` with L2-L5 handles named by the user | User decides, agent writes | File loads; no guessed handle |
| 7.6 | Upload directory: `gh secret set ESCALATION_DIRECTORY_JSON < config/escalation.json` | Agent, after user OK (prod) | Secret timestamp updated |
| 7.7 | Set `JIRA_JQL` to `project in (DC, SHT, APUT) AND statusCategory != Done AND assignee is not EMPTY ORDER BY priority DESC, updated ASC` and run a dry run | Agent, after user OK (prod) | Dry run green; scanned count ≈ open total; no "missing participant" / "no contact" error |
| 7.8 | Run workflow with `seed_only` once so already-crossed levels are recorded without sending | Agent, after user OK | Run green; state cache saved |
| 7.9 | First live scheduled run; check per-project counts in the run summary | Agent | Run green; DMs sent > 0 when a breach exists; no flood |

Order: 7.1 and 7.3 first (answers decide 7.2). 7.4-7.5 in parallel. 7.6 → 7.7 → 7.8 → 7.9.
The recipient allowlist stays as is unless the user lifts it separately.

## Open questions for the user

- Shunkhlai and APU contract: same SLA/escalation timeline as DC?
- L2-L5 contact per project (SHT, APUT).
- Emails for the 8 missing vendor participants (or connect Microsoft 365 so they can be looked up).
