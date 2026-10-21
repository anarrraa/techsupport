# PRD: Tech Success Dashboard + Admin Chat (V2)

## Problem Statement

Support leads currently lack a unified view of their team's SLA performance. To understand ticket load, response trends, or why the automated reminder system made a specific decision, they must navigate Jira directly, read opaque logs, or guess. This creates friction: 
- They cannot quickly answer "who is backlogged right now?"
- They cannot see "how are we trending on High-priority response time?"
- They cannot debug "why wasn't DC-844 in the last reminder?"

The MVP reminder system sends one-way Teams messages when breaches occur. The dashboard gives it a read-side: visibility into current state and historical performance.

## Solution

Build a web application with two interfaces:

1. **Dashboard**: A real-time view of the team's open tickets, grouped by assignee, showing SLA breach status and response-time trends
2. **Admin Chat**: A query interface where leads ask questions ("What's happening now?" "Why is DC-844 skipped?" "How is Uyanga trending?") and get factual, trace-backed answers

Both read from the same Jira data and historical SLA snapshots that the reminder workflow produces. The dashboard is authenticated, showing ticket keys and assignee names (team-internal context, unlike the anonymous reminder log). The web app runs independently from the GitHub Actions reminder workflow but consumes its data.

## User Stories

1. As a support lead, I want to see all open tickets grouped by my team members, so that I can spot who is overloaded right now
2. As a support lead, I want to see which tickets are currently breaching the SLA, so that I know where to focus attention
3. As a support lead, I want to see how long we typically respond to High-priority requests, so that I can forecast if we'll breach on today's queue
4. As a support lead, I want to compare my team's average response time across 30/60/90 days, so that I can spot trends or regressions
5. As a support lead, I want to ask "What's happening right now?" and get a count of open, due, and past-due tickets by priority
6. As a support lead, I want to ask "Why wasn't DC-844 in the last reminder?" and see the full decision trace (breach status, calendar hours, delivery window, escalation level)
7. As a support lead, I want to ask "What's Uyanga's load?" and see total open count, breached count, and this-month average response time
8. As a support lead, I want to see response-time trends by priority so that I can spot which categories are slipping
9. As a support lead, I want to filter tickets by priority, status, or assignee to drill down into a specific slice
10. As a support lead, I want the dashboard to show real-time Jira data so that I trust it as my source of truth, not an outdated cache
11. As a support lead, I want Admin Chat to explain SLA state in Mongolian (language context from team operations)
12. As a support lead, I want to see timestamps on all data so that I know how fresh the information is
13. As a support lead, I want Admin Chat to be conversational ("show me high-priority tickets" should work, not just structured queries)
14. As a support lead, I want to know which requests are paused (waiting on customer) so that I don't mistake a paused SLA for a missed one
15. As a support lead, I want to export ticket lists and trends for monthly reports to stakeholders
16. As an operator, I want historical SLA snapshots to persist automatically during each scheduled reminder run, so that trends can be calculated without re-querying years of history
17. As an operator, I want the dashboard to reuse the same Jira Adapter as the reminder workflow, so that pagination, timeout, and retry logic are consistent
18. As an operator, I want to configure authentication (OAuth, OIDC, or static key) before the dashboard goes live, so that only team members see sensitive data

## Implementation Decisions

### Architecture & Modules

- **Web Service**: Dashboard + Admin Chat run as a separate service from the GitHub Actions reminder workflow. They communicate only via the shared Jira Adapter and the historical snapshot store.
- **Shared Jira Adapter**: Both the reminder workflow and dashboard import the same module (src/lib/jira.ts) for pagination, timeouts, retries, and SLA lookups. This ensures consistent behavior and eliminates drift.
- **Historical Snapshot Store**: During each reminder run, capture the current SLA state for all scanned tickets. Store these snapshots in a database (TBD: PostgreSQL, DynamoDB, or time-series DB like InfluxDB) with a key of (ticket-key, run-id, timestamp). Trends are calculated by aggregating snapshots over time.
- **Admin Chat Query Engine**: A module that translates natural-language questions into Jira queries and SLA logic checks. Does not modify state, only reads and traces decisions.
- **Dashboard Data Layer**: Reuses the same Jira Adapter and reads snapshot history for trends. No separate business logic—presentation only.

### Data Model & Privacy

- **Authentication**: Team members only (scope: method TBD—OAuth, OIDC, or API key). Unauthenticated access is rejected.
- **Data Visibility**: Dashboard and Admin Chat show:
  - Ticket keys (e.g., DC-844)
  - Assignee display names (e.g., Uyanga)
  - Priority, status, age, SLA state
  - Response times (working-hours elapsed, from Jira)
  - **NOT**: customer names, request summaries, comments (to respect customer privacy)
- **Logging**: No ticket keys, assignee names, or customer data in application logs (same principle as the reminder workflow).

### Query Engine (Admin Chat)

- Accepts free-form questions in English or Mongolian
- Maps questions to one or more Jira queries + SLA logic checks
- Returns factual results with full decision traces (e.g., "DC-844 is not breached because it is paused on Waiting for Customer status")
- Does not predict or infer; only reports what Jira and SLA state say
- Bounded timeouts: queries must complete in <5s or return "system busy, try again"

### Snapshot Persistence

- Triggered: Each time the reminder workflow runs (twice daily)
- Captured: For every ticket scanned, write (ticket-key, priority, status, assignee, sla-state, elapsed-working-minutes, paused, breach-status, timestamp)
- Retention: 90 days minimum (for trend calculation); longer if storage is cheap
- Schema: Simple key-value or time-series table; no complex joins

### Trend Calculation

- Response time by priority: Average (and median, p95) of elapsed-working-minutes across all tickets at that priority, grouped by week or month
- Response time by assignee: Same, per person
- Trend direction: Compare 30/60/90 day windows to spot regressions
- Calculation: On-the-fly aggregation from snapshots; cache results if needed for performance

### External Integrations

- **Jira JSM**: Paginated queries via shared Jira Adapter; SLA state from `/rest/servicedeskapi/request/{key}/sla`
- **Database**: Persist and retrieve snapshots; schema TBD pending storage choice
- **Authentication**: Delegated to an external provider (not in scope for this PRD)

## Testing Decisions

### Test Strategy

A good test exercises external behavior without mocking internal state. Tests should answer: "Does the dashboard correctly reflect what Jira and the snapshot store say?" not "Does the query parser call the right function?"

### Modules to Test

- **Jira Adapter**: Reuse existing tests (already covered in MVP); add pagination + SLA lookup tests if new methods are added
- **Admin Chat Query Engine**: Test 20+ real scenarios (e.g., "show me high-priority tickets", "why is DC-844 skipped?", "what's Uyanga's load?") against fixture data
- **Snapshot Persistence**: Test read/write of snapshot data; verify retention window; test trend calculation against known snapshots
- **Dashboard Routes**: Integration test that dashboard loads, shows data, filters work, trends display correctly
- **Trend Calculation**: Unit tests for average/median/p95 aggregation; test week/month grouping

### Test Fixtures

- Use Jira fixture data (same as MVP tests): real DC request keys and SLA states
- Create snapshot fixtures: 90 days of synthetic SLA data at varying thresholds (breached, not breached, paused)
- Create query fixtures: 20+ example Admin Chat questions + expected responses

### Test Patterns

- Follow the pattern in `tests/lib/jira.test.ts` for adapter tests (mock HTTP, verify pagination)
- Follow the pattern in `tests/workflows/jira-teams-reminder.test.ts` for end-to-end behavior
- Use the same test utilities (timeout helpers, retry logic verification) to ensure consistency with MVP

## Out of Scope

- **Modifying SLA behavior from the dashboard**: Dashboard is read-only. SLA definitions, pauses, and calendar settings remain in Jira and JSM only.
- **Two-way Teams chat**: Admin Chat is a web interface only. The Teams bot remains a reminder sender (one-way).
- **Durable delivery ledger**: The reminder workflow's delivery ledger (which messages were sent, when, to whom) is not exposed in the dashboard. Escalation state is read-only.
- **Read receipts or acknowledgements**: No tracking of whether an admin opened or acknowledged a message.
- **Custom KPI definitions**: Trends are calculated on standard SLA metrics only (response time, resolution time). Custom metrics or weighted scoring are out of scope.
- **Entra group login**: Authentication method is TBD; Entra integration is a future gate, not a blocker.
- **Export to analytics databases**: Snapshots are stored for trend calculation only; no data warehouse or BI tool integration.

## Further Notes

### Relationship to MVP

The MVP reminder workflow is complete and deployed. This PRD describes V2, which **does not change the reminder workflow**. The dashboard and Admin Chat are additive: they read the data the workflow produces, but do not modify behavior.

### Repository Organization

The web app should live in a **separate repository** (`zero/techsupport-dashboard` or similar) to keep the reminder workflow's GitHub Actions logic isolated and focused. The shared Jira Adapter can be published as an npm package or included via git submodule/monorepo tooling.

### Dependency on MVP

This feature depends on:
- MVP reminder workflow running twice daily (to produce snapshots)
- Jira JSM configured with SLA metrics (already done for MVP)
- Snapshot storage available (database or file store)

It does **not** depend on:
- Teams bot escalation (V2 milestone 2 of the roadmap)
- Off-hours phone-call automation
- Microsoft Entra configuration

### Timeline & Blockers

**Before development starts:**
- [ ] Agree on storage choice for snapshots (PostgreSQL, DynamoDB, InfluxDB, or file-based)
- [ ] Agree on authentication method (OAuth, OIDC, or API key)
- [ ] Confirm language support: English only, or add Mongolian to Admin Chat?

**Before launch:**
- [ ] Dashboard performs well with 50+ open tickets and 90 days of history
- [ ] Admin Chat handles 20+ realistic question patterns without failure
- [ ] Snapshot collection runs automatically during reminder workflow (no manual trigger)
- [ ] Team tests the dashboard end-to-end against live Jira

### Known Risks

- **Snapshot quality**: If the reminder workflow fails or is skipped, gaps appear in the trend history. Mitigation: log snapshot writes visibly; alert if a day has no snapshots.
- **Jira API throttling**: Dashboard queries + reminder workflow + manual Jira use could exceed rate limits. Mitigation: query caching, rate-limit headers monitored.
- **Data staleness**: Dashboard shows current Jira state; historical snapshots lag by hours (captured during reminder runs). Users must expect "trends are yesterday's data."
