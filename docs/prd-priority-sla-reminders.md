# PRD: Contract-based First Response SLA reminders

Status: implemented baseline

## Problem

Support leads need an actionable Teams digest when a Jira Service Management
request has breached the contractual First Response SLA. The system must not
reimplement Jira's calendar, treat arbitrary issue edits as a response, leak Jira
data to an LLM, or repeat the same reminder every 15 minutes.

## Source of truth

`docs/sla-matrix.md` defines the contractual goals. Jira Service Management owns
the matching SLA goals, working-hours calendar, pauses, and holidays. The workflow
consumes JSM's First Response SLA cycle rather than calculating age from `created`
or `updated`.

## Required behavior

1. Fetch every issue matched by the configured JQL, up to an explicit safety cap.
2. Read the configured First Response SLA metric from the JSM request SLA API.
3. Select only an ongoing cycle where `breached=true`, `paused=false`, and
   `withinCalendarHours=true`.
4. Open one reminder delivery window per configured repeat interval. Defaults are
   a 15-minute window every 60 minutes for a workflow scheduled every 15 minutes.
5. Sort by priority and then longest overdue; group by assignee.
6. Produce factual ticket lines deterministically, escape Jira-controlled text,
   and split oversized messages.
7. Send only aggregate counts to Gemini for an optional one-line introduction.
8. Post nothing when no ticket is due. In dry-run mode, post nothing and log only
   aggregate counts.
9. Bound external calls with timeouts, retries, pagination limits, and SLA lookup
   concurrency.
10. Fail visibly when the configured SLA metric is absent from every scanned
    issue.

## Delivery and security

- GitHub Actions runs every 15 minutes with a concurrency group.
- Pull requests run test, typecheck, and build checks without production secrets.
- Vertex authentication uses GitHub OIDC and Google Workload Identity Federation.
- Jira and Teams credentials remain repository secrets.
- Local `.env` and service-account files remain ignored.

## Out of scope

- Contractual off-hours Critical/High phone calls and L2-L5 escalation.
- Two-way Teams bot interactions or direct messages.
- An exactly-once durable delivery ledger. The stateless delivery-window policy is
  best-effort and matches the accepted GitHub Actions scheduler constraint.
- Resolution SLA reporting and monthly compliance reports.

## Acceptance checks

- Jira search and SLA metric pagination are covered by adapter tests.
- Completed, paused, non-breached, and outside-calendar cycles are excluded.
- Reminder-window boundaries and priority ordering are deterministic.
- Untrusted Markdown is escaped and long messages are chunked.
- Rate limits are retried and permanent authentication failures are not.
- `npm test`, `npm run typecheck`, and `npm run build` pass.
