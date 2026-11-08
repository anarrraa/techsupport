# techsupport - Jira JSM to Teams SLA reminders

A scheduled Flue workflow that reads Jira Service Management's authoritative
**First Response SLA**, selects currently breached requests, and posts a concise
developer-grouped reminder to a Microsoft Teams channel.

Agent context and project documents are indexed in [for-agents/README.md](for-agents/README.md).

## Project status

The implementation baseline exists, but the production MVP is not complete. See
`for-agents/roadmap.md` for current evidence, release blockers, rollout steps, and
the definition of done. Repository agents must follow `AGENTS.md` before making
changes.

The complete output is deterministic by default. Gemini on Vertex AI is optional and receives
aggregate counts only to write a one-line introduction; Jira titles, names, email
addresses, and links are never sent to the model. `src/reminder/reminder-intro.ts` owns that
contract: its input type cannot express Jira-controlled content, and it reports whether the
model or the deterministic opener was used rather than failing the run.

## Architecture

```text
GitHub Actions (twice a working day)
  -> Jira enhanced JQL search (paginated)
  -> JSM SLA API (paginated, bounded concurrency) — first response + resolution
  -> current breach + calendar + reminder-window selection
  -> deterministic, escaped, chunked Teams messages
  -> Teams Incoming Webhook            (channel reminder, optional)
  -> Teams personal bot direct messages (participant reminder + L2-L5 escalation, optional)
```

At least one transport must be configured. The channel webhook and the personal
bot are independent: either alone is a working deployment.

Key modules:

```text
src/shared/config.ts                 validated environment configuration
src/shared/http.ts                   timeout and bounded retry policy
src/shared/jira.ts                   Jira search + JSM SLA adapter
src/reminder/sla.ts                  pure reminder selection policy
src/reminder/reminder-message.ts     deterministic Teams message builder
src/shared/teams-webhook.ts          Teams webhook adapter
src/shared/teams-bot.ts              Bot Connector direct-message adapter
src/escalation/escalation.ts         pure L2-L5 threshold and routing policy
src/escalation/escalation-config.ts  person directory and contact resolver
src/escalation/escalation-state.ts   highest level notified per ticket
src/escalation/direct-messages.ts    pure per-recipient message planning
src/reminder/reminder-intro.ts       optional aggregate-only intro writer
src/workflows/jira-teams-reminder.ts workflow orchestration
```

## Repository layout

```text
src/agents/          Flue-discovered agent bindings
src/workflows/       Flue-discovered workflow modules
src/shared/          config, HTTP, Jira and Teams adapters used by several features
src/reminder/        first-response reminder policy and messages
src/escalation/      L2-L5 escalation policy, directory, state, direct messages
src/monthly-report/  monthly report aggregation and PDF/Excel export
src/support-report/  client support report: input reader, builder, PDF
src/backend/         express server, Prisma client (db.ts), generated Prisma output
tests/<feature>/     unit tests, mirroring src/<feature>
tests/workflows/     workflow orchestration tests
```

Tests live outside `src/` deliberately. Flue scans `src/agents/`, `src/workflows/`
and `src/channels/` and requires every file found there to default-export the
matching definition, so a `*.test.ts` beside a workflow fails the build. Keeping
the feature folders free of framework imports is also deliberate: it keeps the unit suite
loading in milliseconds instead of paying for the agent runtime.

## Authoritative SLA

`for-agents/sla-matrix.md` is the business source of truth:

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

The workflow is scheduled twice a working day, at the **start** of each window
the team asked for — 09:00 and 14:00 Ulaanbaatar. Mongolia is UTC+8 all year, so
the cron entries need no seasonal adjustment.

The schedule is not trusted to be punctual, because GitHub's is not: measured
against their cron times, past runs of this workflow started 45 to 489 minutes
late, a median near two hours, and one never fired at all. So the cron decides
only when to *try*, and `REMINDER_WINDOWS` decides whether a run may deliver. A
late run inside the window still delivers; a run delayed into the night delivers
nothing rather than waking someone; and weekends never deliver. Starting at each
window's opening leaves three hours of room in the morning and four in the
afternoon, which covers 10 of the 13 delays measured — so about a quarter of
attempts miss their window, and both attempts miss on roughly one working day
in twenty.

The schedule is the cadence: `REMINDER_DELIVERY_WINDOW_MINUTES` equals
`REMINDER_REPEAT_MINUTES`, so every eligible breach is reminded on every run.
A narrower window is only meaningful when the workflow runs far more often than
a reminder should be sent, and it interacts badly with a sparse schedule — if
the gap between runs is a whole multiple of the repeat interval, `elapsed %
repeat` is identical at every run and the breaches that start outside the window
never enter it. A test pins that relationship.

**A request that has been answered is never reminded about.** The first-response
cycle completes on the first reply, and only an `ongoing` cycle is eligible, so
replying inside or outside the SLA both stop the reminders. Of 26 open DC
requests on 2026-09-08, 9 had answered cycles and were excluded before any
window or schedule logic ran.

GitHub Actions is best-effort, so a strict paging/on-call system must be
implemented separately.

## Setup

1. Configure the First Response SLA in Jira Service Management to match
   `for-agents/sla-matrix.md`.
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

Microsoft Graph cannot post the message: `POST /chats/{id}/messages` has no
usable application permission. But it can do the two things that make a message
deliverable, and this is the split the tenant's own production bot
(`zero/goOrange`) already uses:

```text
Graph  -> install the app for the recipient, read back their personal chat id
Bot    -> POST {serviceUrl}/v3/conversations/{chatId}/activities
```

The obvious alternative, `POST /v3/conversations`, returns
`403 ForbiddenOperationException` for anyone who has not installed the app
themselves. Installing first removes that failure rather than reporting it,
which is worth two Graph calls per recipient. No hosting and no inbound endpoint
are involved either way.

Prerequisites, in order:

1. An Azure subscription, and a single-tenant Entra app registration.
2. An Azure Bot resource (free tier) with the Teams channel enabled and the
   messaging endpoint left empty.
3. A notification-only Teams app package scoped to personal chats. Build it from
   this repo:

   ```sh
   npm run package:teams
   ```

   That produces `packages/sla-reminder-teams-app.zip` from
   `packages/teams-app/`. Teams requires `manifest.json` and both icons at the
   **root** of the archive, which is why this is a script and not a manual zip.
   `isNotificationOnly: true` in the manifest is what removes the reply box, so
   the app cannot become a two-way chat by accident.

   The icons are placeholders. Replace them with the real brand marks, keeping
   `color.png` at 192x192 and `outline.png` at 32x32 with a transparent
   background. The `developer` URLs in the manifest must resolve before the
   organisation catalog will accept the package.
4. An administrator publishes the package to the **organisation catalog**. No
   Teams app setup policy and no per-person upload are needed: Graph installs
   the app for each recipient on first delivery. The catalog publish is the one
   step that cannot be automated away, because Graph finds the app by its
   catalog entry.
5. Graph **application** permissions with admin consent — delegated ones are
   useless here, because nobody is signed in when the schedule fires:

   | Permission | What it is for |
   | --- | --- |
   | `AppCatalog.Read.All` | find the app in the organisation catalog |
   | `TeamsAppInstallation.ReadWriteSelfForUser.All` | install this app for a recipient. Try this one first: it is limited to this app. Fall back to `TeamsAppInstallation.ReadWriteForUser.All` if Graph refuses |
   | `User.Read.All` | only for `npm run resolve:ids`. Skip it if the object ids are read from the Azure portal instead |
6. A GitHub OIDC federated credential on the app registration, so no client
   secret is stored. Subject `repo:<owner>/<repo>:ref:refs/heads/main`, audience
   `api://AzureADTokenExchange`.
7. `config/escalation.json`, copied from the example. **It is gitignored**: it
   names real people, and this repository is public. GitHub Actions reads it from
   the `ESCALATION_DIRECTORY_JSON` secret instead, which the workflow writes to
   that path before the run:

   ```sh
   gh secret set ESCALATION_DIRECTORY_JSON < config/escalation.json
   ```

   Re-run that whenever the directory changes. Fill in each person's `email` and
   `jiraAccountId`, then let the object ids be looked up rather than pasted:

   ```sh
   npm run resolve:ids
   ```

   That reuses the same app-only Graph credential the bot uses, so there is no
   Azure CLI to install and no interactive sign-in. Teams rejects an email or
   user principal name when addressing someone, so the object id is what the bot
   needs; the email is recorded only so the id can be resolved. A hand-pasted
   GUID off by a character is a recipient who is silently unreachable, which is
   why this is a script that validates the file afterwards.

Prove the transport before scheduling anything:

```sh
npm run verify:bot -- <entra-object-id>
npm run trace
```

`npm run trace` runs the real selection and routing against live Jira and
narrates every stage with names — which requests are in scope, which are due and
which are waiting for their window, which crossed a contractual level, how each
Jira account resolved to a Teams recipient, and the exact message each person
would receive. It sends nothing.

It is the counterpart to the run journal, which is deliberately unable to name a
request or a person because it goes to CI logs. That is why the trace is a local
command and is not wired into the workflow: the two have opposite jobs.

The setup scripts read `.env` themselves, so the bot settings only have to be
written once. They print a missing setting as a message and exit, rather than
raising it as a stack trace — a blank credential is a setup step, not a fault.

Each failure names its own fix, because they need different people to act:
`not-in-catalog` needs an administrator to publish the package,
`install-forbidden` needs Graph consent, `writes-blocked` is a tenant policy,
and `not-installed` means Graph installed the app but Teams still had no chat.

## Who gets the first-response reminder

The **request participants**, not the assignee. On this service desk the
assignee is the support team that triages a request; the participants are the
people expected to act on it. The field is
`JIRA_PARTICIPANTS_FIELD`, `customfield_10065` by default.

That field mixes vendor staff with the client's own portal users, and the client
must never be told they owe a response. `src/shared/jira.ts` keeps only
`accountType: 'atlassian'` when it builds `JiraTicket.participants`, so the
filter happens once at the boundary rather than in every caller — a client
contact cannot reach routing at all. Two tests hold that line, one at the
adapter and one at the router.

A request whose participants are all absent from the directory is counted as
`unmappedRecipients` and warned about. It is not an error: one person missing
must not stop everyone else's reminders.

## Escalation

`for-agents/sla-matrix.md` sections 2 and 3 are implemented in `src/escalation/escalation.ts`:
elapsed working time on the JSM **resolution** metric selects the contractual
level, and `config/escalation.json` names the person for it. Inside calendar
hours escalation is sequential; off-hours Critical/High notifies L1 and L2
together and names the on-call engineer for a human to call.

"Highest level notified per ticket" persists in a GitHub Actions cache, so a
level is never notified twice. A cache miss re-notifies a level rather than
skipping one.

**Stage the rollout.** Set `TEAMS_BOT_RECIPIENT_ALLOWLIST` and nobody else can
be messaged, whatever the escalation directory says. Set it in **both** places
— the repository variable and your `.env` — so a local `npm run remind` cannot
reach people a scheduled run would not:

```sh
TEAMS_BOT_RECIPIENT_ALLOWLIST=first.pilot@your-org.com,second.pilot@your-org.com
```

Entries match the directory by email, directory handle, or object id. The
directory cannot serve as the pilot's blast radius, because it has to hold
everyone for the policy to resolve a level at all. A withheld level is **not**
recorded as notified, so it is delivered once the gate opens rather than lost.
An entry that matches nobody is an error naming the entry, not a gate that
quietly delivers nothing.

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

## Monthly dashboard backend

`for-agents/prd-monthly-dashboard.md`. With `DATABASE_URL` set, every run (dry-run
included) stores one `SLASnapshot` row per scanned ticket: JSM's figures only,
no summary, comment, or person. A capture failure is a warning, never a failed
run. Without the Entra variables the API has no auth and binds to `127.0.0.1`;
the server refuses any other host until they are set (see Deploy below).

```sh
# pgvector image: the schema enables the `vector` extension (docs chat), so plain postgres fails db push
docker run -d --name dashboard-pg -p 127.0.0.1:5433:5432 \
  -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=dashboard pgvector/pgvector:pg16
export DATABASE_URL=postgres://postgres@localhost:5433/dashboard
npm run db:push        # schema-first: prisma/schema.prisma
npm run dev:backend    # :3001, GET /health, GET /api/reports/YYYY-MM, POST /api/chat
npm run docs:index     # docs chat: embed documents/ (GOOGLE_CLOUD_PROJECT + ADC), counts only
```

Start the frontend in a second terminal after starting the backend:

```sh
cd frontend
npm ci
npm run dev          # http://127.0.0.1:5173/dashboard; /api proxies to :3001
```

Root `npm run dev` starts the Flue workflow development server, not the dashboard.
The report supports UTC month selection, refresh, both SLA breach counts,
first/latest capture dates, capture days, missing SLA flags, and PDF/Excel
exports. Database reads reject months larger than 100,000 snapshots with HTTP
413 rather than displaying a partial result. API contract and smoke checks:
[monthly-report-api.md](for-agents/monthly-report-api.md).

The dashboard, archive, PDF, and Excel exports read stored snapshots. There is
no sample-data fallback: empty months have zero tickets and unavailable databases
return HTTP 503. These are sampled-ticket metrics, not complete historical SLA
compliance: no data exists before capture starts, and closed tickets outside the
configured JQL are not newly captured.

For scheduled capture, configure a reachable PostgreSQL database in the GitHub
`DATABASE_URL` secret after applying the schema. The workflow passes that secret
to capture; a missing URL disables capture. This deployment remains unverified.
Keep the unauthenticated report API bound to localhost.

Optional PostgreSQL regression against a disposable database:

```sh
TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5433/dashboard node --test tests/backend/db.test.ts
```

## Deploy (Cloud Run)

Requirements: [prd-hosting-auth.md](for-agents/prd-hosting-auth.md). One container
(`Dockerfile`): Express serves the API and `frontend/dist`; Cloud SQL PostgreSQL
with pgvector; Microsoft Entra login limited to one group. Every `/api` route
except `/api/health` and `/api/auth/*` needs a session. Without all six auth
variables the server exits instead of listening on `0.0.0.0`.

**Runbook, not executed.** Nothing below has been run; no cloud resource exists.
Replace every `<PLACEHOLDER>`; none of the ids are known to this repo.

```sh
gcloud config set project <PROJECT_ID>
gcloud services enable run.googleapis.com sqladmin.googleapis.com artifactregistry.googleapis.com \
  secretmanager.googleapis.com aiplatform.googleapis.com

# Database (pgvector is available on Cloud SQL PostgreSQL)
gcloud sql instances create <INSTANCE> --database-version=POSTGRES_16 --region=<REGION> --tier=db-custom-1-3840
gcloud sql databases create dashboard --instance=<INSTANCE>
gcloud sql users create <DB_USER> --instance=<INSTANCE> --password=<DB_PASSWORD>
# Schema (creates the vector extension): from a workstation through the Cloud SQL Auth Proxy
cloud-sql-proxy <PROJECT_ID>:<REGION>:<INSTANCE> --port 5432 &
DATABASE_URL='postgresql://<DB_USER>:<DB_PASSWORD>@127.0.0.1:5432/dashboard' npm run db:push
DATABASE_URL='postgresql://<DB_USER>:<DB_PASSWORD>@127.0.0.1:5432/dashboard' npm run docs:index   # optional: docs chat

# Secrets (values typed or piped, never committed)
printf '%s' '<ENTRA_CLIENT_SECRET>' | gcloud secrets create entra-client-secret --data-file=-
openssl rand -base64 48 | tr -d '\n' | gcloud secrets create session-secret --data-file=-
printf '%s' 'postgresql://<DB_USER>:<DB_PASSWORD>@localhost/dashboard?host=/cloudsql/<PROJECT_ID>:<REGION>:<INSTANCE>' \
  | gcloud secrets create database-url --data-file=-

# Runtime identity
gcloud iam service-accounts create techsupport-run
for role in roles/cloudsql.client roles/secretmanager.secretAccessor roles/aiplatform.user; do
  gcloud projects add-iam-policy-binding <PROJECT_ID> \
    --member=serviceAccount:techsupport-run@<PROJECT_ID>.iam.gserviceaccount.com --role=$role
done

# Image
gcloud artifacts repositories create techsupport --repository-format=docker --location=<REGION>
gcloud auth configure-docker <REGION>-docker.pkg.dev
docker build --platform linux/amd64 --build-arg NODE_VERSION=$(cat .node-version) \
  -t <REGION>-docker.pkg.dev/<PROJECT_ID>/techsupport/app:<TAG> .
docker push <REGION>-docker.pkg.dev/<PROJECT_ID>/techsupport/app:<TAG>

# Service. --allow-unauthenticated: Cloud Run lets the request in, the app's Entra login decides.
gcloud run deploy techsupport --region=<REGION> \
  --image=<REGION>-docker.pkg.dev/<PROJECT_ID>/techsupport/app:<TAG> \
  --service-account=techsupport-run@<PROJECT_ID>.iam.gserviceaccount.com \
  --add-cloudsql-instances=<PROJECT_ID>:<REGION>:<INSTANCE> \
  --allow-unauthenticated --max-instances=2 \
  --set-env-vars=ENTRA_TENANT_ID=<TENANT_ID>,ENTRA_CLIENT_ID=<CLIENT_ID>,ENTRA_ALLOWED_GROUP_ID=<GROUP_OBJECT_ID>,PUBLIC_URL=<PUBLIC_URL>,GOOGLE_CLOUD_PROJECT=<PROJECT_ID>,GOOGLE_CLOUD_LOCATION=<VERTEX_REGION> \
  --set-secrets=ENTRA_CLIENT_SECRET=entra-client-secret:latest,SESSION_SECRET=session-secret:latest,DATABASE_URL=database-url:latest
gcloud run services describe techsupport --region=<REGION> --format='value(status.url)'   # = <PUBLIC_URL> if no custom domain

# Check
curl -s <PUBLIC_URL>/api/health                                  # 200 {"status":"ok"} (no DB; /health checks the DB)
curl -s -o /dev/null -w '%{http_code}\n' <PUBLIC_URL>/api/reports/2026-10   # 401
```

Entra app registration (portal, by an admin): platform **Web**, redirect URIs
`<PUBLIC_URL>/api/auth/callback` (sign-in) and `<PUBLIC_URL>/` (return after
sign-out); a client secret (into `entra-client-secret`);
Token configuration → add the **groups** claim to the ID token.
`<TENANT_ID>` must be the directory (tenant) GUID, not a domain. A user whose
token has no `groups` claim (group overage) is refused, so prefer "Groups
assigned to the application" and assign `<GROUP_OBJECT_ID>` to the app. If the
first deploy is what reveals the URL, redeploy with `PUBLIC_URL` set and add the
redirect URI afterwards.

Open for the real deploy (roadmap 5.5): support report configs
(`config/support-report/*.json`, gitignored) are not in the image and need a
mounted secret; scheduled capture from GitHub Actions needs a route to Cloud SQL
(e.g. the Auth Proxy in the workflow) before the `DATABASE_URL` secret can point
at it.

## GitHub Actions

`ci.yml` runs tests, type checking, and a build on pushes and pull requests.

`jira-teams-reminder.yml` runs at 10:00 and 15:00 Ulaanbaatar time on working
days, with concurrency protection and Google Workload Identity Federation. Configure these repository secrets:

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
