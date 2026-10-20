# PRD: Monthly SLA dashboard backend (V2)

Status: backend foundation approved 2026-10-19; frontend, auth, and model
summaries not started

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
5. `GET /health` reports liveness and database reachability.
6. `ChatMessage` records delivery metadata only (ticket key, level, kind,
   timestamp), never message text. Nothing writes it yet.
7. `MonthlyReport` holds a frozen month's aggregate. Nothing writes it yet.

## Out of scope

- Dashboard frontend, Microsoft Entra login, and any authorization on the API.
  The server must not be exposed beyond localhost until auth exists.
- LLM summaries (Phase 2). Only aggregate counts may ever reach a model.
- Backfilling months before capture started.

## Acceptance checks

- Snapshot mapping and month aggregation are unit tested.
- A workflow test proves a failing capture leaves the run's output unchanged.
- `npm test`, `npm run typecheck`, `npm run build`, and `npx prisma db push`
  pass; the server answers `/health` and `/api/reports/:month` locally.
