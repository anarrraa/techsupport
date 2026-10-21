# PRD: Tech Success Dashboard + Admin Chat

Status: design phase (post-MVP V2)

## Problem

Support leads need real-time and historical visibility into their team's ticket load and SLA performance. Today they must navigate Jira directly or ask the reminder system. They want:
- **Current state**: Who has how many open tickets? Which are breached?
- **Historical trends**: How long do we typically respond to High priority? How is Uyanga trending this month?
- **Decision visibility**: Why did the reminder system skip this ticket? What was the full decision trace?

## Scope

**In scope:**
- Dashboard: Web UI showing open tickets grouped by person, with SLA breach status and response-time trends
- Admin Chat: Query interface answering questions about current state and past decisions
- Historical SLA snapshots: Persist SLA state during each scheduled run so trends can be calculated
- Shared Jira Adapter: Both the reminder workflow and dashboard use the same module

**Out of scope:**
- Modifying SLA behavior from the dashboard (read-only)
- Two-way chat with the Teams bot (only one-way reminders in MVP)
- Durable delivery ledger or read receipts
- Microsoft Entra group login (authentication handled separately)

## Required behavior

### Dashboard

1. Display all open requests (not just breached) grouped by assignee
2. For each ticket show: key, priority, status, age, and current SLA state
3. For each assignee show: total count, breached count, average response time (this month)
4. Display trends: response time by priority (30/60/90 day average)
5. All data is real-time from Jira, with historical snapshots for trends

### Admin Chat

1. Answer "What's happening now?" with aggregate counts and optionally detailed view
2. Answer "Why is DC-844 not in reminders?" with full decision trace (breach status, calendar hours, delivery window, escalation level)
3. Answer "What's Uyanga's load?" with open count, breached count, and average response time
4. Answer "How are we trending?" with response time by priority over 30/60/90 days
5. All responses include only ticket keys and assignee names (authenticated admin context, not anonymous)

## Data sources

- **Jira JSM**: Real-time request state via shared Jira Adapter
- **Historical snapshots**: SLA state cached once per scheduled reminder run (Run Journal + SLA data)
- **Database** (TBD): Persist snapshots for trend calculation

## Delivery

- Separate web service from the GitHub Actions reminder workflow
- May run on the same infrastructure or independently
- No shared state with the reminder workflow except via Jira and the historical snapshot store

## Privacy & security

- **Authentication**: Team members only (to be determined: OAuth, OIDC, static key)
- **Data visibility**: Admin sees ticket keys and assignee names (differs from reminder log, which is aggregate-only)
- **No PII in logs**: Same principle as reminder workflow

## Acceptance checks

- Dashboard loads in <2s with current state for 50+ tickets
- Admin Chat responds to 5 sample queries in <1s each
- Historical trends calculate correctly from weekly snapshots over 90 days
- All external calls are bounded with timeouts and retry logic
- Shared Jira Adapter handles both reminder workflow and dashboard traffic
- Authentication is required; unauthenticated access is rejected

## Definition of done

- [ ] Dashboard and Admin Chat PRD reviewed and approved by the team
- [ ] Web app repository created with baseline structure (backend, frontend, database schema)
- [ ] Shared Jira Adapter extracted into reusable module
- [ ] Historical snapshot persistence implemented (database or cache strategy)
- [ ] Dashboard UI built and integrated with Jira Adapter
- [ ] Admin Chat query engine built and tested against 10+ scenarios
- [ ] End-to-end test: dashboard + chat against live Jira data
- [ ] Deployment configured (web service, scheduled snapshot job)
- [ ] Roadmap updated with completion evidence
