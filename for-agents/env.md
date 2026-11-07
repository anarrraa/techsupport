# Environment

All parsing: `src/shared/config.ts`. Local runs read `.env` (`--env-file-if-exists`
in `package.json` scripts). Names only here — **never read or print `.env` or
`gcp-sa.json`**. Template: `.env.example`.

"CI" = passed by `.github/workflows/jira-teams-reminder.yml` (s = secret, v = variable).
Not in CI → the code default applies in production.

## Jira

| Var | Default / bounds | CI | Purpose |
| --- | --- | --- | --- |
| `JIRA_BASE_URL` | required, https | s | site URL |
| `JIRA_EMAIL`, `JIRA_API_TOKEN` | required | s | basic auth |
| `JIRA_JQL` | required unless dry-run; else DC default (`config.ts:115`) | v | scope |
| `JIRA_FIRST_RESPONSE_SLA_NAME` | `Time To First Response` | v | reminder metric |
| `JIRA_RESOLUTION_SLA_NAME` | `Time to resolution` | v | escalation metric |
| `JIRA_PARTICIPANTS_FIELD` | `customfield_10065` | v | request participants |
| `JIRA_PAGE_SIZE` | 50 (1–100) | v | search page |
| `JIRA_MAX_RESULTS` | 500 (1–5000) | v | total cap |
| `JIRA_MAX_SEARCH_PAGES` | 100 (1–1000) | v | page cap |
| `JIRA_SLA_PAGE_SIZE` | 50 (1–100) | v | SLA page |
| `JIRA_MAX_SLA_PAGES` | 10 (1–100) | v | SLA page cap |
| `JIRA_SLA_CONCURRENCY` | 5 (1–20) | v | parallel SLA calls |
| `JIRA_COMMENT_LIMIT` | 6 (0–50) | v | comments kept |
| `JIRA_COMMENT_CHARS` | 600 (50–5000) | v | per-comment cap |

## Reminder

| Var | Default / bounds | CI | Purpose |
| --- | --- | --- | --- |
| `REMINDER_DRY_RUN` | false | input `dry_run` | no posting, counts-only log |
| `REMINDER_WINDOWS` | `09:00-12:00,14:00-18:00` | v | when delivery is allowed |
| `REMINDER_TIMEZONE` | `Asia/Ulaanbaatar` | v | zone for windows |
| `REMINDER_REPEAT_MINUTES` | 60 (15–1440) | v | re-remind cadence |
| `REMINDER_DELIVERY_WINDOW_MINUTES` | = repeat; must be ≤ repeat | v | see gotchas |
| `REMINDER_USE_LLM_INTRO` | false | v | model intro (aggregate counts) |
| `REMINDER_INTRO_TIMEOUT_MS` | 10000 | — | |
| `REMINDER_USE_LLM_DIGEST` | false | v | model digest — **see gotchas before enabling** |
| `REMINDER_DIGEST_TIMEOUT_MS` | 20000 | v | |
| `TEAMS_MAX_MESSAGE_CHARS` | 12000 (1000–25000) | v | message chunking |
| `HTTP_TIMEOUT_MS` | 10000 (1000–120000) | v | per request |
| `HTTP_MAX_RETRIES` | 2 (0–5) | v | 429/5xx only |

## Transports

| Var | Default | CI | Purpose |
| --- | --- | --- | --- |
| `TEAMS_WEBHOOK_URL` | none (https) | s | channel post; optional if bot set |
| `TEAMS_BOT_APP_ID`, `TEAMS_BOT_TENANT_ID` | none; set both or neither | v | enables bot |
| `TEAMS_BOT_APP_PASSWORD` | none; CI uses OIDC (`ACTIONS_ID_TOKEN_REQUEST_URL`) | s | local client secret |
| `TEAMS_BOT_SERVICE_URL` | `https://smba.trafficmanager.net/teams` | v | Bot Connector region |
| `TEAMS_APP_EXTERNAL_ID` | = app id | v | catalog lookup |
| `GRAPH_CLIENT_ID` / `GRAPH_CLIENT_SECRET` | = app id / = app password | v / — | Graph creds |
| `TEAMS_BOT_RECIPIENT_ALLOWLIST` | none (no gate) | v | comma list: email, handle or oid |

## Escalation

| Var | Default | CI | Purpose |
| --- | --- | --- | --- |
| `ESCALATION_CONFIG_FILE` | `config/escalation.json` | — (file from secret `ESCALATION_DIRECTORY_JSON`) | directory |
| `ESCALATION_STATE_FILE` | `.escalation-state/state.json` | — (Actions cache) | state |
| `ESCALATION_SEED_ONLY` | false | input `seed_only` | record levels, notify nobody |

## Google (only if an LLM flag is on, or for the docs chat)

CI secrets `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_SERVICE_ACCOUNT`,
`GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION` (`yml:93-102`).
The docs chat (`src/docs-chat/vertex.ts`) reads the same two locally, with ADC;
`GOOGLE_CLOUD_LOCATION` defaults to `us-central1`.

## Hosting and staff login (`src/backend/auth.ts`, `prd-hosting-auth.md`)

Read by the backend at startup, not by `config.ts`. Set all six or none; none is
only allowed on a loopback `BACKEND_HOST` (fail closed).

| Var | Default | Purpose |
| --- | --- | --- |
| `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID` | none | Entra app registration |
| `ENTRA_CLIENT_SECRET` | none | secret; Secret Manager in Cloud Run |
| `ENTRA_ALLOWED_GROUP_ID` | none | the one group allowed in (`groups` claim) |
| `SESSION_SECRET` | none; ≥ 32 chars | HMAC key for the session cookie |
| `PUBLIC_URL` | none; https origin | redirect URI = `<PUBLIC_URL>/api/auth/callback` |
| `BACKEND_HOST` | `127.0.0.1` | bind address; container `0.0.0.0` |
| `PORT` / `BACKEND_PORT` | 3001 | Cloud Run sets `PORT` |

## Not in `.env.example` (read by `config.ts`)

`HTTP_TIMEOUT_MS`, `HTTP_MAX_RETRIES`, `JIRA_PAGE_SIZE`, `JIRA_MAX_RESULTS`,
`JIRA_MAX_SEARCH_PAGES`, `JIRA_SLA_PAGE_SIZE`, `JIRA_MAX_SLA_PAGES`,
`JIRA_SLA_CONCURRENCY`, `TEAMS_MAX_MESSAGE_CHARS`, `REMINDER_WINDOWS`,
`REMINDER_TIMEZONE`. Add them there if you touch them.
