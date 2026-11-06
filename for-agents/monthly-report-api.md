# Internal monthly report API

Scope authorized 2026-11-04 in `for-agents/prd-monthly-dashboard.md`.
The API binds to localhost; authentication and public/client access are absent.
Requests read PostgreSQL only, never Jira or Teams. No request mutates SLA state.

## Routes

- `GET /health`: 200 `{status:"ok",database:"connected"}` after a real database
  query; 503 `{status:"unavailable",database:"unavailable"}` otherwise.
- `GET /api/reports/:month`: 200 monthly report from stored observations.
- `GET /api/reports/:month/export?format=pdf|excel`: attachment from the same
  monthly aggregation. PDF and Excel state the sampled-data limitation.

Month is exactly `YYYY-MM`, year 0001–9999 and month 01–12, using the UTC
half-open range from the month's first day to the next month's first day.
Malformed months or export formats return 400 before database access.
Database errors return a sanitized 503. More than 100,000 monthly snapshot rows
returns 413 without partial results or partial exports. Reads use a cap+1 probe.

## Report semantics

Each ticket contributes once, using its latest observation in the selected UTC
month. This is sampled Jira data: requests closed outside the configured scan
may never be captured, and months before capture started cannot be reconstructed.
A recorded missing SLA flag is unknown, never a verified healthy result.

Report fields include:

- `month`, `generatedAt` (response time), `snapshots` (all selected-month rows),
  `tickets` (distinct observed tickets).
- `firstResponseBreached`, `resolutionBreached` (JSM flags from latest rows).
- `firstResponseKnown`, `firstResponseMissing`, `resolutionKnown`,
  `resolutionMissing` (counts of non-null/null breach flags on latest rows).
- `firstResponseBreachRate`, `resolutionBreachRate`: compatibility ratios over
  **all observed tickets**, including unknown flags; null when there are none.
  These are not complete monthly contractual compliance rates.
- `coverage.firstCapturedAt`, `coverage.lastCapturedAt`: ISO UTC capture
  instants, null for an empty month. `coverage.capturedDays`: distinct UTC dates
  containing observations. Coverage is not successful-sync or delivery history.
- `summary`: existing frontend metric envelope, plus `resolutionBreaches`.
- `priorityTotals`: counts grouped by original Jira priority.
- `byPriority`: frontend buckets (Highest→critical, High→high, Medium→medium,
  Low/Lowest→low); unknown schemes remain in raw counts and totals.
- `team`, `trend`: empty; response-time values remain unavailable.

Empty months are truthful zero counts with null rates and capture timestamps.
No mock fallback, identities, ticket summaries, comments, or message bodies are
returned. Frozen monthly reports and delivery metadata models are not written.

## Reusable smoke checks

`for-agents/api/monthly-report.postman_collection.json` uses a local `baseUrl`
and contains health/report/invalid-input/export assertions. Example:

```sh
postman collection run for-agents/api/monthly-report.postman_collection.json --no-report-events --timeout 30000 --timeout-request 10000
```

Run against a local server connected to disposable PostgreSQL. A pass verifies
that local instance, not scheduled production capture. The installed CLI may not
support `postman status`; use command-specific help rather than guessing setup.
