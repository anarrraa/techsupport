# techsupport - Jira JSM to Teams SLA reminders

A scheduled Flue workflow that reads Jira Service Management's authoritative
**First Response SLA**, selects currently breached requests, and posts a concise
developer-grouped reminder to a Microsoft Teams channel.

## Project status

The implementation baseline exists, but the production MVP is not complete. See
`docs/mvp-roadmap.md` for current evidence, release blockers, rollout steps, and
the definition of done. Repository agents must follow `AGENTS.md` before making
changes.

The complete output is deterministic by default. Gemini on Vertex AI is optional and receives
aggregate counts only to write a one-line introduction; Jira titles, names, email
addresses, and links are never sent to the model. `src/lib/reminder-intro.ts` owns that
contract: its input type cannot express Jira-controlled content, and it reports whether the
model or the deterministic opener was used rather than failing the run.

## Architecture

```text
GitHub Actions (every 15 min)
  -> Jira enhanced JQL search (paginated)
  -> JSM SLA API (paginated, bounded concurrency) — first response + resolution
  -> current breach + calendar + reminder-window selection
  -> deterministic, escaped, chunked Teams messages
  -> Teams Incoming Webhook            (channel reminder, optional)
  -> Teams personal bot direct messages (assignee reminder + L2-L5 escalation, optional)
```

At least one transport must be configured. The channel webhook and the personal
bot are independent: either alone is a working deployment.

Key modules:

```text
src/lib/config.ts                    validated environment configuration
src/lib/http.ts                      timeout and bounded retry policy
src/lib/jira.ts                      Jira search + JSM SLA adapter
src/lib/sla.ts                       pure reminder selection policy
src/lib/reminder-message.ts          deterministic Teams message builder
src/lib/teams-webhook.ts             Teams webhook adapter
src/lib/teams-bot.ts                 Bot Connector direct-message adapter
src/lib/escalation.ts                pure L2-L5 threshold and routing policy
src/lib/escalation-config.ts         person directory and contact resolver
src/lib/escalation-state.ts          highest level notified per ticket
src/lib/direct-messages.ts           pure per-recipient message planning
src/lib/reminder-intro.ts            optional aggregate-only intro writer
src/workflows/jira-teams-reminder.ts workflow orchestration
```

## Repository layout

```text
src/agents/        Flue-discovered agent bindings
src/workflows/     Flue-discovered workflow modules
src/lib/           plain modules, no framework imports
tests/lib/         unit tests, mirroring src/lib
tests/workflows/   workflow orchestration tests
```

Tests live outside `src/` deliberately. Flue scans `src/agents/`, `src/workflows/`
and `src/channels/` and requires every file found there to default-export the
matching definition, so a `*.test.ts` beside a workflow fails the build. Keeping
`src/lib/` free of framework imports is also deliberate: it keeps the unit suite
loading in milliseconds instead of paying for the agent runtime.

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
3. Optional: create a Teams channel Incoming Webhook for the aggregated channel
   reminder. If classic connectors are disabled, create the equivalent Teams
   Workflows webhook and adapt the payload contract.
4. For the optional Gemini intro, enable Vertex AI and authenticate locally with
   Application Default Credentials.
5. Copy `.env.example` to `.env` and fill in the local values. Never commit `.env`
   or a service-account JSON key.
6. For direct messages and contract escalation, set up the personal Teams bot and
   copy `config/escalation.example.json` to `config/escalation.json`. See
   "Personal Teams bot" below.

Non-dry runs require an explicit, project-specific `JIRA_JQL`. The fallback query
is dry-run-only and scans every assigned, non-Done issue visible to the integration
account.

## Personal Teams bot

Microsoft Graph cannot direct-message a person from an unattended job:
`POST /chats/{id}/messages` has no usable application permission. The verified
path is a Bot Framework bot, which needs no hosting and no inbound endpoint —
only a token, a conversation, and an activity. `docs/mvp-roadmap.md` records the
executed evidence.

Prerequisites, in order:

1. An Azure subscription, and a single-tenant Entra app registration.
2. An Azure Bot resource (free tier) with the Teams channel enabled and the
   messaging endpoint left empty.
3. A notification-only Teams app package scoped to personal chats.
4. The app installed in each recipient's personal scope. At organisation scale
   that means an administrator publishes the package to the organisation catalog
   and assigns a Teams app setup policy to the recipient group; a per-person
   custom upload only proves the path.
5. A GitHub OIDC federated credential on the app registration, so no client
   secret is stored. Subject `repo:<owner>/<repo>:ref:refs/heads/main`, audience
   `api://AzureADTokenExchange`.
6. `config/escalation.json`, copied from the example and filled in with a real
   Microsoft Entra object id for every possible assignee and every L2-L5 contact.
   Teams rejects an email or user principal name here.

Prove the transport before scheduling anything:

```sh
TEAMS_BOT_APP_ID=... TEAMS_BOT_TENANT_ID=... TEAMS_BOT_APP_PASSWORD=... \
  npm run verify:bot -- <entra-object-id>
```

`403 ForbiddenOperationException` means the recipient has no personal
installation; `403 MessageWritesBlocked` means a tenant or app policy forbids the
message. The two need different fixes, so the code reports them separately.

## Escalation

`docs/sla-matrix.md` sections 2 and 3 are implemented in `src/lib/escalation.ts`:
elapsed working time on the JSM **resolution** metric selects the contractual
level, and `config/escalation.json` names the person for it. Inside calendar
hours escalation is sequential; off-hours Critical/High notifies L1 and L2
together and names the on-call engineer for a human to call.

"Highest level notified per ticket" persists in a GitHub Actions cache, so a
level is never notified twice. A cache miss re-notifies a level rather than
skipping one.

**Seed the state before the first live run.** Requests that have been open for a
while have already crossed several levels, and an empty state file treats every
one of them as new. A dry-run against the DC project on 2026-09-07 found 9 such
requests, two of them already past the L5 executive mark. Run once with
`ESCALATION_SEED_ONLY=true` (and `REMINDER_DRY_RUN` unset) to record the current
levels and notify nobody; from then on only new crossings are delivered.

## Commands

```sh
npm ci
npm test
npm run typecheck
npm run build
npm run remind
npm run verify:bot -- <entra-object-id>
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
- `TEAMS_WEBHOOK_URL` (only for the channel reminder)

Configure `JIRA_JQL` as a required repository variable for non-dry runs. For the
personal bot, configure `TEAMS_BOT_APP_ID`, `TEAMS_BOT_TENANT_ID`, and if the
default endpoint is wrong for the tenant's region `TEAMS_BOT_SERVICE_URL`, as
repository **variables** — none of them is a secret, and the token comes from the
OIDC federated credential. Other optional repository variables are documented in
`.env.example`; verify `JIRA_FIRST_RESPONSE_SLA_NAME` and
`JIRA_RESOLUTION_SLA_NAME` against production Jira.

## Operational limits

- The bot never places a phone call. Off-hours Critical/High escalation names the
  on-call engineer in the message; a human places the call.
- A chat reply is never evidence that an SLA was satisfied. Jira ticket state is
  the only source of resolution.
- The contract sets no clock mark for Low L5 ("only if SLA breached"), so Low
  never escalates past L4 automatically. Confirm the intent with the client
  before adding a threshold.
- The first-response reminder follows JSM's calendar, which pauses the clock
  outside working hours, so a first-response direct message is only sent inside
  calendar hours. Off-hours contact is the escalation path's job.
- Public-holiday behavior is owned by the configured JSM SLA calendar.
- Jira and Teams calls have timeouts and bounded retries for rate limits and
  transient server errors.
- The run fails when the configured SLA metric is absent from every scanned
  ticket, preventing a configuration mistake from silently disabling reminders.
