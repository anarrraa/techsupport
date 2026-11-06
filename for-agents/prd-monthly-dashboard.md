# PRD: Monthly SLA dashboard backend (V2)

Status: backend foundation approved 2026-10-19; existing frontend integration
approved in the roadmap and reconfirmed 2026-11-03. Production capture remains
unverified; authentication and model summaries are out of scope. The user
authorized delegated research and implementation of the internal reporting
experience on 2026-11-04, including the scope below.

## Problem

Contract section 5 asks for monthly compliance reporting. Today every run reads
JSM SLA state and discards it, so there is no history to report from.

## Source of truth

Jira Service Management still owns every SLA figure. The backend stores what
JSM reported at each run and aggregates those stored values; it never derives
SLA age, calendar time, or breach state from issue timestamps (`AGENTS.md`).

## Required behavior

1. When `DATABASE_URL` is set, each reminder run stores one `SLASnapshot` row per
   scanned ticket: key, priority, status, and the JSM first-response and
   resolution cycle fields (state, breached, paused, elapsed, remaining).
2. Snapshot capture is additive. It must not change selection, delivery, output,
   or exit status of the reminder run; a capture failure is logged as a warning
   without ticket content.
3. No summary, comment, assignee, participant, or other free text is stored.
4. `GET /api/reports/:month` (`YYYY-MM`) aggregates the latest snapshot of each
   ticket seen in that UTC month: ticket count, first-response and resolution
   breach counts and rates, and the same counts by priority.
5. `GET /health` reports liveness and database reachability (200 when connected,
   503 otherwise). Report reads return 503 on database failure, never sample data.
6. `ChatMessage` records delivery metadata only (ticket key, level, kind,
   timestamp), never message text. Nothing writes it yet.
7. `MonthlyReport` holds a frozen month's aggregate. Nothing writes it yet.

8. Preserve the existing dashboard response envelope (`summary`, `byPriority`
   array, `snapshots`, `team`, `trend`) while retaining raw monthly totals
   and per-Jira-priority counts in `priorityTotals`.
   Unavailable response times remain null; team and daily trend remain empty.
   The archive reads up to 12 UTC months through the same API, showing only
   months with captured snapshots. No random or synthetic fallback is allowed.
9. PDF and Excel exports use the same snapshot aggregation as the dashboard.
   Invalid months or formats return 400 before accessing the database.

## Internal reporting completion, authorized 2026-11-04

The existing design system and MN/EN internal support/management audience apply.
This phase completes monthly snapshot reporting; production integration and Jira
administration acceptance remain separate and open.

- Choose the report month, refresh it, and download the same month in PDF/Excel.
- Expose `coverage` with `firstCapturedAt`, `lastCapturedAt` (ISO UTC or null),
  and `capturedDays` (distinct UTC dates with stored observations). These are
  capture facts, never the time of a successful Jira sync or delivery.
- Show first-response and resolution breach counts. Label percentages as
  observed snapshot results, disclosing that the latest snapshot per observed
  ticket is counted and the scan may omit already resolved tickets. Do not
  present complete contractual monthly compliance or unknown metrics as facts.
- Show observed tickets with known/missing first-response and resolution flags
  so missing metrics are not implicitly described as healthy. Preserve existing
  total-based rate fields for compatibility; label denominators clearly.
- Complete the existing report layout with a month toolbar, coverage disclosure,
  SLA metrics, priority chart/table, and export actions. Retain the existing
  navigation; unimplemented team/chat routes explain their limitations.
- Archive reads at most 12 UTC months, supports retry and download failures,
  uses the current MN/EN locale, and remains usable in dark mode and on mobile.
- Cap monthly database reads, fail visibly rather than report a truncated month,
  keep error output free of data/connection details, and bound client requests.
- No new ticket/recipient database, current-workload claims, operations history,
  client access, model summaries, frozen reports, or delivery ledger is included.
  Those require their own data contracts and acceptance checks.
- All exported reports state the sampled-data limitation and include coverage;
  keep exports deterministic from the selected month's stored observations.

Acceptance: backend query/HTTP/export tests, frontend data/error tests, all
repository test/typecheck/build commands, and a disposable PostgreSQL integration
check. Local/synthetic evidence must remain distinct from production evidence.

## Out of scope

- New branding, Microsoft Entra login, and any authorization on the API.
  The server must not be exposed beyond localhost until auth exists.
- LLM summaries (Phase 2). Only aggregate counts may ever reach a model.
- Backfilling months before capture started.

## Acceptance checks

- Snapshot mapping and month aggregation are unit tested.
- A workflow test proves a failing capture leaves the run's output unchanged.
- `npm test`, `npm run typecheck`, `npm run build`, and `npx prisma db push`
  pass; the server answers `/health` and `/api/reports/:month` locally.
