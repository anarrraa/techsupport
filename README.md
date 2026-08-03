# techsupport - Jira JSM to Teams SLA reminders

A scheduled Flue workflow that reads Jira Service Management's authoritative
**First Response SLA**, selects currently breached requests, and posts a concise
developer-grouped reminder to a Microsoft Teams channel.

The complete output is deterministic by default. Gemini on Vertex AI is optional and receives
aggregate counts only to write a one-line introduction; Jira titles, names, email
addresses, and links are never sent to the model.

## Architecture

```text
GitHub Actions (every 15 min)
  -> Jira enhanced JQL search (paginated)
  -> JSM SLA API (paginated, bounded concurrency)
  -> current breach + calendar + reminder-window selection
  -> deterministic, escaped, chunked Teams messages
  -> Teams Incoming Webhook
```

Key modules:

```text
src/lib/config.ts                    validated environment configuration
src/lib/http.ts                      timeout and bounded retry policy
src/lib/jira.ts                      Jira search + JSM SLA adapter
src/lib/sla.ts                       pure reminder selection policy
src/lib/reminder-message.ts          deterministic Teams message builder
src/lib/teams-webhook.ts             Teams webhook adapter
src/agents/reminder-writer.ts        optional aggregate-only intro writer
src/workflows/jira-teams-reminder.ts workflow orchestration
```

## Authoritative SLA

`docs/sla-matrix.md` is the business source of truth:

| Jira priority | First response |
| --- | ---: |
| Highest | 30 min |
| High | 45 min |
| Medium | 60 min |
| Low / Lowest | 240 min |

Configure the same goals and Mon-Fri 09:00-18:00 calendar in Jira Service
Management. The application does not duplicate Jira's calendar math. It reads the
metric named by `JIRA_FIRST_RESPONSE_SLA_NAME` and only selects an ongoing cycle
when it is breached, not paused, and currently inside its JSM calendar.

The workflow runs every 15 minutes. By default each breached ticket has a
15-minute delivery window once every 60 minutes. This keeps the workflow stateless
while avoiding a post on every scheduled run. GitHub Actions is best-effort, so a
strict paging/on-call system must be implemented separately.

## Setup

1. Configure the First Response SLA in Jira Service Management to match
   `docs/sla-matrix.md`.
2. Create a Jira API token for an account that can read the selected requests and
   their SLA information.
3. Create a Teams channel Incoming Webhook. If classic connectors are disabled,
   create the equivalent Teams Workflows webhook and adapt the payload contract.
4. For the optional Gemini intro, enable Vertex AI and authenticate locally with
   Application Default Credentials.
5. Copy `.env.example` to `.env` and fill in the local values. Never commit `.env`
   or a service-account JSON key.

Use a project-specific `JIRA_JQL`; the default query scans every assigned,
non-Done issue visible to the integration account.

## Commands

```sh
npm ci
npm test
npm run typecheck
npm run build
npm run remind
```

Set `REMINDER_DRY_RUN=true` to execute Jira/SLA selection without posting to
Teams. Dry-run logs counts only and does not log ticket content.

## GitHub Actions

`ci.yml` runs tests, type checking, and a build on pushes and pull requests.

`jira-teams-reminder.yml` runs every 15 minutes with concurrency protection and
Google Workload Identity Federation. Configure these repository secrets:

- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_SERVICE_ACCOUNT`
- `GOOGLE_CLOUD_PROJECT`
- `GOOGLE_CLOUD_LOCATION`
- `JIRA_BASE_URL`
- `JIRA_EMAIL`
- `JIRA_API_TOKEN`
- `TEAMS_WEBHOOK_URL`

Optional repository variables are documented in `.env.example`. In particular,
set `JIRA_JQL` and verify `JIRA_FIRST_RESPONSE_SLA_NAME` against production Jira.

## Operational limits

- Off-hours Critical/High phone escalation from the contract is not implemented;
  use the organization's paging/on-call platform for that requirement.
- Public-holiday behavior is owned by the configured JSM SLA calendar.
- Jira and Teams calls have timeouts and bounded retries for rate limits and
  transient server errors.
- The run fails when the configured SLA metric is absent from every scanned
  ticket, preventing a configuration mistake from silently disabling reminders.
