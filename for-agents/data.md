# Data and external APIs

Contract values (SLA minutes, levels) are defined in
`for-agents/sla-matrix.md`; code mirrors them in `src/escalation/escalation.ts:16-45`.

## Postgres — `prisma/schema.prisma`

Optional (`DATABASE_URL`); Prisma only in `src/backend/db.ts`. `SLASnapshot`,
`MonthlyReport`, `ChatMessage` hold JSM figures and delivery metadata only.
`DocChunk` holds chunks of `documents/**/*.md` for the docs chat
(`for-agents/prd-docs-chat.md`), never Jira data: `client`, `system`, `path`,
`heading`, `content`, `contentHash` (unique), `embedding
vector(768)`. The schema enables the pgvector `vector` extension
(`postgresqlExtensions` preview), so the database must ship pgvector
(`pgvector/pgvector:pg16` locally). `embedding` is `Unsupported`: read and
written with raw SQL only. No vector index yet (sequential scan).

## Jira Cloud / JSM (basic auth: `JIRA_EMAIL` + `JIRA_API_TOKEN`)

| Call | Where | Notes |
| --- | --- | --- |
| `POST /rest/api/3/search/jql` | `src/shared/jira.ts:251` | token pagination (`nextPageToken`, `isLast`); repeated token throws (`:281`); capped by `JIRA_MAX_RESULTS` / `JIRA_MAX_SEARCH_PAGES`, sets `truncated` |
| fields requested | `src/shared/jira.ts:258-265` | `summary, status, priority, assignee, comment, <JIRA_PARTICIPANTS_FIELD>` |
| `GET /rest/servicedeskapi/request/{key}/sla` | `src/shared/jira.ts:310` | per issue, `JIRA_SLA_CONCURRENCY` parallel; needs **agent** access on the project |
| `GET /rest/api/2/project/{p}/statuses` | `scripts/trace-run.ts:72` | trace only |

`SlaCycle` (`src/shared/jira.ts:4-26`): `state`, `breached`, `paused`,
`withinCalendarHours`, `breachTimeEpochMillis`, `elapsedMinutes` (JSM
`elapsedTime`, from cycle start), `remainingMinutes` (JSM `remainingTime`,
negative once breached). Two metrics per ticket: first response
(`JIRA_FIRST_RESPONSE_SLA_NAME`) and resolution (`JIRA_RESOLUTION_SLA_NAME`).

`JiraTicket` (`src/shared/jira.ts:58`): `participants` = vendor-only
(`accountType 'atlassian'`); `comments` = last `JIRA_COMMENT_LIMIT`, ADF
flattened, each with `authorIsVendor`.

Priority → severity: Highest→critical, High→high, Medium→medium,
Low/Lowest→low (`src/escalation/escalation.ts:16`).

## Microsoft (bot transport, `src/shared/teams-bot.ts`)

| Step | Endpoint | Where |
| --- | --- | --- |
| Token (client secret locally, GitHub OIDC federated in CI) | `login.microsoftonline.com/{tenant}/oauth2/v2.0/token` | `:113`, `:131` |
| Find app in org catalog | Graph `GET /appCatalogs/teamsApps?$filter=externalId…` | `:186` |
| Install app for user / read personal chat | Graph `/users/{oid}/teamwork/installedApps` | `:228` |
| Post DM | Bot Connector `POST {serviceUrl}/v3/conversations/{chatId}/activities` | `:314` |

Graph cannot post chat messages app-only; Bot Connector does the send
(`:8-13`). Failures map to `DeliveryFailureReason`: `unknown-recipient`,
`not-in-catalog`, `install-forbidden`, `not-installed`, `writes-blocked`,
`other` (`:28-39`).

Channel transport: Teams Incoming Webhook POST (`src/shared/teams-webhook.ts:4`).

Optional model: Gemini 2.5 Flash on Vertex (`src/reminder/reminder-intro.ts:38`,
`src/escalation/ticket-digest.ts:180`) via Google WIF in CI.

All HTTP goes through `fetchOk` (`src/shared/http.ts:28`): per-attempt timeout,
retries only 429/500/502/503/504 (`:79`), honors `Retry-After` up to 60s.

## Escalation directory — `config/escalation.json`

Gitignored; in CI written from secret `ESCALATION_DIRECTORY_JSON`
(`.github/workflows/jira-teams-reminder.yml:62-69`). Shape: see
`config/escalation.example.json`; schema `src/escalation/escalation-config.ts:19-51`.

```text
people:   { <handle>: { name, email?, entraObjectId (UUID, not nil), jiraAccountId? } }
projects: { <JiraProjectKey>: { L2?, L3?, L4?, L5? -> handle } }
onCall?:  handle   # surfaced off-hours; a human places the call
```

A level with no contact is an error, never skipped.

## Escalation state — `.escalation-state/state.json`

`{ "<ticketKey>": <highest level notified 1-5> }` (`src/escalation/escalation-state.ts:20-23`).
Atomic write via temp + rename (`:56-64`). No pruning. Persisted only in the
GitHub Actions cache (`yml:79-86`, save `:147-152`).
