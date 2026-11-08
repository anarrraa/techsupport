# MVP completion roadmap

Last reviewed: 2026-11-06

## Goal

Ship the contract-based First Response SLA reminder described in
`for-agents/prd-priority-sla-reminders.md` as a production-verified workflow. Jira
Service Management remains the source of truth for SLA state and calendar
calculations. This roadmap tracks release readiness; the PRD tracks product
requirements.

## Current verdict

**Baseline implemented; production MVP acceptance remains open. Teams bot has
verified live delivery; dashboard database integration is locally verified.**

The Jira and SLA blockers that masked each other are cleared: `JIRA_JQL` is
scoped to DC and the integration account reads SLA data. Local acceptance
commands pass, dry-run output is aggregate-only, and release-critical workflow
branches are covered.

What is left for the MVP is external verification, not code: a controlled
Jira-to-Teams delivery and observed scheduled runs (milestones 3 and 4).

The V2 personal-bot and escalation code landed on 2026-09-07. Live delivery
was recorded on 2026-09-08; on 2026-11-03, scheduled run
[41598181147](https://github.com/anarrraa/techsupport/actions/runs/41598181147)
succeeded and logged 3 direct messages to 3 recipients and one L2 crossing.
This verifies transport execution, not recipient-side rendering or every
production SLA/calendar acceptance check. Historical unchecked prerequisites
below must not be read as proof they are still absent.

## End state and phases — set 2026-11-06

**End state.** One internal "Tech Success" system for the Zerotech support team:

1. A scheduled workflow reads Jira SLA state and reminds/escalates (L2-L5) in
   Teams, by channel post and personal bot message. Production verified.
2. One internal web app, behind Microsoft Entra login for staff only:
   monthly SLA dashboard with PDF/Excel export, the client support report
   generator, and a chat that answers from `documents/` (RAG).
3. Hosted and running unattended: backend + frontend, Postgres with pgvector,
   snapshot capture from every scheduled run.

Jira stays the only SLA authority throughout. Client login, live operations
telemetry, and Jira-backed chat answers are not part of the end state.

**Phases.** Scope per phase and completion reports: `plan/`. "Human" = blocked on an admin, the client, or the user, not on code;
those run alongside the code phases.

| # | Phase | Kind | Done when | Detail |
| --- | --- | --- | --- | --- |
| 0 | Clean slate: gitignore `documents/`, commit current work, rotate `TEAMS_BOT_APP_PASSWORD`, remove stray root files `f`/`fd` | User | Clean `git status`, password rotated | "Restructure + documentation chat", TODO.md |
| 1 | MVP production acceptance: JSM goals/calendar/metric confirmed, controlled live delivery, 4 scheduled runs observed | Human | MVP definition of done all checked | Milestones 3-4 |
| 2 | Restructure: backend feature folders, frontend `features/`, shared types | Code | Same test counts pass after each move | 2.1-2.3 |
| 3 | Documentation chat (pgvector RAG, Vertex) | Code + user GCP | Real questions answered with correct sources | 3.1-3.6, `prd-docs-chat.md` |
| 4 | Bot production: catalog publish, Graph consent, GitHub OIDC, escalation directory, seeded state, two-person staged run, Low L5 answer, fortnight of window data | Human | V2 milestone 2 all checked | V2 milestones 1-2, TODO.md |
| 5 | Hosting + auth: PRD for Entra login; host chosen; deploy app + DB; scheduled capture writes to it | Code + user decision | Staff log in to the hosted app; a scheduled run's snapshot appears | 5.1-5.5, `prd-hosting-auth.md` |
| 6 | Reporting acceptance: browser/keyboard check, real client export through the UI, staff side-by-side review, `Time to first response` format | Human + code fixes | Support staff sign off one month's reports | "Internal reporting completion", "Client support report generator" |

Order: 0 → 2 → 3 → 5 → 6 for code; 1 and 4 run in parallel as soon as the
people they wait on are available. Phase 5 must precede any exposure of chat
or reports beyond localhost.

Open decisions (record answers here):

- Host for phase 5: **decided 2026-11-07** — Cloud Run (one container, Express
  serves API + frontend) + Cloud SQL Postgres with pgvector; Entra ID OIDC login
  restricted to one group. `prd-hosting-auth.md`.
- Still open (user supplies at deploy): GCP project and region, Entra tenant,
  app registration (client id/secret), and the allowed group's id.

## Evidence snapshot

| Check | Status | Evidence |
| --- | --- | --- |
| Toolchain matches pins | Pass | `scripts/verify-toolchain.mjs` exit 0 with Node 22.19.0 and npm 10.9.3 on 2026-08-20 |
| Clean local install | Pass | `npm ci` installed 337 packages on 2026-08-20 |
| Unit tests | Pass | `npm test`: 190 tests, 189 passed, 0 failed, 1 opt-in database check skipped on 2026-11-06 after the phase 3 review fixes; frontend 14 passed. The database check last passed against disposable PostgreSQL 16 on 2026-11-04 |
| Container + auth (local) | Pass | 2026-11-08 after the phase 5 review: `docker build` (node 22.19.0-slim, user `node`; Node < 22.18 fails the build); with a throwaway pgvector DB and fake auth env `/api/health` 200 (no DB), `/health` 200, `/api/monthly-report` and `/api/reports/2026-10` 401 without cookie, `/dashboard` 200, same-origin POST logout clears the cookie, cross-site 403; no auth env on `0.0.0.0` → exit 1. Root tests 207/206/1 skip, frontend 21. Not deployed; no real Entra login yet (5.5) |
| Docs chat live (Vertex + pgvector) | Pass with one miss | 2026-11-06: real `documents/` indexed into a throwaway pgvector DB with the user's GCP project (gcloud default); 6/7 known questions answered and cited correctly; logs counts-only. Re-checked after the review fixes the same day: index 2762 new then 0, 2 answers cited, no-answer question returned empty sources. Not yet on a shared database |
| Type checking | Pass | `npm run typecheck` exit 0 (root and frontend) on 2026-11-06 after the phase 3 review fixes |
| Production build | Pass | `npm run build` produced `dist/server.mjs` on 2026-11-06; frontend `npm run build` exit 0 the same day |
| GitHub CI | Pass | Run `30893672018` passed install, test, typecheck, and build on 2026-08-04 |
| **Deployed to `main`** | Pass | PR #2 merged an earlier snapshot 2026-09-08 03:35 UTC; PR #3 merged the remaining 18 commits at 08:15 UTC. `main` now carries the twice-daily schedule, participant routing, and the trace tool |
| Escalation state seeded in the Actions cache | Pass | Run `34203911077` (`seed_only=true`) wrote the directory from the secret, recorded 7 crossed levels (L2:2 L3:3 L5:2), delivered **0** messages, and saved `escalation-state-34203911077` |
| Scheduled run verified in production | Pass | The dry-run immediately after reported `Scanned 26; 17 due, 9 not breached, 0 outside calendar, 0 awaiting window`, `0 request(s) crossed an escalation level` — the seed held — and `2 direct message(s) to 2 recipient(s)` with `11 withheld` by the rollout gate |
| Production logs are aggregate-only | Pass | The run log above contains no ticket key, no assignee or participant name, no email, and no object id. Checked against two ticket-key prefixes, two assignee display names, a recipient's work address, a Cyrillic summary fragment, and a recipient object id |
| Scheduled reminder workflow (before) | Was failing | Runs `34075035131` (2026-09-07), `34005624863` (2026-09-06) and `33938369442` (2026-09-05) all exited 1 with `Missing required env var: TEAMS_WEBHOOK_URL`. The variable had been removed from the workflow env while `src/shared/config.ts` still required it. Fixed on `feat/teams-bot-escalation`; needs a green scheduled run to confirm |
| Scoped JQL correctness | Pass | On 2026-08-26 `JIRA_JQL` set to `project = DC AND statusCategory != Done AND assignee is not EMPTY` |
| Local production dry-run | Pass | On 2026-08-26 dry-run scans real DC issues and reaches SLA endpoint |
| JSM SLA read access | Pass | On 2026-08-26 `GET /rest/servicedeskapi/request/DC-844/sla` returns 200 OK (agent access granted) |
| First response metric name | Pass | On 2026-08-20 `GET /rest/api/3/field` lists `Time to first response`; `JIRA_FIRST_RESPONSE_SLA_NAME` matches it case-insensitively |
| Live Jira-to-Teams delivery | **Pass** (bot transport) | On 2026-09-08 a local live run delivered 3 escalation messages covering 7 real DC requests to the two pilot recipients, then re-ran and delivered nothing. The channel-webhook transport remains unattempted and is not configured |
| Escalation message quotes the right clock | Fixed 2026-09-08 | The first preview printed `0м хэтэрсэн` on escalation rows: it quoted the first-response clock on a message raised by the resolution clock, and a request past its resolution mark can have no first-response cycle at all. Escalation rows now read the resolution cycle and say `шийдэгдээгүй`; DC-811 went from `0м` to `158ц` |
| Overdue uses working hours | Pass | On 2026-08-26 `elapsedMinutes` from JSM used instead of clock time |
| Empty scan detection | Pass | On 2026-08-26 `scanned: 0` in non-dry-run mode throws visible error |
| V2 bot and escalation code | Live transport verified | Added 2026-09-07; live send recorded 2026-09-08 and successful scheduled delivery checked 2026-11-03 (run `41598181147`). Full rollout acceptance remains open |
| Live bot direct message from this codebase | **Pass** | On 2026-09-08 `npm run verify:bot -- <object-id>` printed `Bot Framework and Graph tokens acquired` then `Direct message delivered`. First message this codebase has ever sent. The full chain ran: client-credentials tokens for both scopes, catalog lookup by external id, install-for-user, personal chat lookup, activity post |
| Graph application consent | Pass | Implied by the run above: the Graph token was issued and the catalog and installation calls succeeded, so `AppCatalog.Read.All` and the installation permission are consented |
| First-response reminders route to participants | Pass | Changed 2026-09-08 on the user's instruction: the assignee is the triaging support team, the participants are who acts. A dry-run plans 6 recipients across the open DC requests with `unmappedRecipients: 0`. The three assignee-only support accounts are no longer in the directory and can no longer be messaged |
| Client contacts excluded from routing | Pass | The participants field on open DC requests holds 14 `atlassian` accounts and 9 `customer` accounts — the latter are Digital Concept's own people, including the reporter of every request. `src/shared/jira.ts` drops `accountType != 'atlassian'` at the adapter, so the client cannot reach routing; asserted at both the adapter and the router |
| Assignees resolvable to recipients | Superseded | The four agents on open DC requests — Uyanga, Unursaikhan, Delgertsetseg, Khulan — are in the directory as of 2026-09-08 with both their Jira account id and Entra object id, so a first-response breach now reaches the person who owes the reply. Before this, every such breach only raised `N breached request(s) have no assignee entry`, and the escalation chain fired above a first rung that had never been rung |
| Jira does not expose agent email addresses | Noted | `emailAddress` is absent for `accountType: atlassian` users, so `resolve:ids` cannot map an agent by email. Their Entra object ids were resolved by Graph display-name search instead; the directory keys on `jiraAccountId`, which Jira does expose |
| Recipient identifiers | Pass | Entra object ids for both pilot recipients recorded in `config/escalation.json` 2026-09-08. A first attempt used the app registration's own object id and Graph answered 404; that case now reports `unknown-recipient` with the distinction spelled out |
| Staged rollout gate verified end to end | Pass | On 2026-09-08 `npm run trace -- --allowlist` reported 2 recipients and 8 withheld. The same command had previously reported 10 recipients and 0 withheld: the variable is set on the repository but was absent from `.env`, so a local run had wider reach than a scheduled one, and `--allowlist` applied nothing without saying so. The flag now exits with an error when no allowlist is configured, and `.env` mirrors the deployed value |
| Jira reachable from GitHub Actions | Pass | Run `34185580185` (dispatch, `dry_run=true`, 2026-09-08) logged `Scanned 25; 5 due, 9 not breached, 0 outside calendar, 11 awaiting window` before stopping on the absent escalation directory — the Jira secrets and JQL variable resolve correctly in CI |
| Escalation directory reaches CI | Pass | `ESCALATION_DIRECTORY_JSON` secret set 2026-09-08 from the completed directory; the workflow writes it to `config/escalation.json` before the run |
| Escalation directory reaches CI (superseded) | Was | The 2026-09-08 dry-run failed with `Escalation config file not readable at config/escalation.json`. The repository is **public** and the directory names real people — emails, Jira account ids, Entra object ids — so committing it was the wrong fix. It is now gitignored and carried as the `ESCALATION_DIRECTORY_JSON` secret, which the workflow writes to that path before the run |
| Bot application id known | Pass | Read from the Azure portal 2026-09-08: `b76bcdfb-5a16-44c4-81e0-860780daa2da`, single tenant, one secret, activated. Recorded here deliberately: an application id and a tenant id are not secrets — the app id is substituted into every published Teams manifest and the tenant id is returned by any sign-in endpoint for the domain. Staff email addresses and Entra object ids are a different class and are kept out of tracked files |
| Package accepted by Teams | Fixed 2026-09-08 | The first upload was rejected: `Schema validation failed at 'packageName': Property "packageName" has not been defined and the schema does not allow additional properties`. Manifest 1.23 sets `additionalProperties: false`, and `packageName` — valid in 1.16, which this manifest was first written against — is not in it. Removed. Teams names the offending property exactly, so no local allowlist was added to duplicate that check |
| Teams app package built with the real id | Pass | On 2026-09-08 `npm run package:teams` produced `packages/sla-reminder-teams-app.zip` carrying that id as both manifest `id` and `botId`, `scopes: [personal]`, `isNotificationOnly: true` |
| Teams app published to the organisation catalog | Not attempted | administrator action; per-person custom upload only proved the path on 2026-08-20 |
| GitHub OIDC federated credential on the Entra app | Not attempted | code path implemented and unit tested; the credential itself is not configured |
| `config/escalation.json` populated | Not attempted | Jira account ids for the two pilot recipients resolved 2026-09-07; object ids still needed, via `npm run resolve:ids` |
| **GitHub's cron cannot meet the time-window requirement** | Blocking, measured 2026-09-09 | The 02:00 UTC run on 2026-09-09 never fired at all. Measuring every past `schedule` event against its cron time gives delays of 45, 46, 128, 130, 131, 135, 135, 154, 160, 168, 295, 357 and 489 minutes — a median around two hours and a tail past eight. A 10:23 Ulaanbaatar slot therefore lands at 12:23 typically and 18:23 at worst, outside the 09:00-12:00 window the team asked for. Moving the cron off the hour (`:00` to `:23`) did not help. `workflow_dispatch` is unaffected: every manual dispatch in this project started within seconds. The fix is an external trigger calling the dispatch API, not more cron tuning |
| Schedule set to the team's working rhythm | Changed 2026-09-08 | Twice a working day: `0 2 * * 1-5` and `0 7 * * 1-5`, which are 10:00 and 15:00 in Ulaanbaatar (UTC+8, no daylight saving since 2016). `REMINDER_DELIVERY_WINDOW_MINUTES` was raised to equal `REMINDER_REPEAT_MINUTES` in the same change: the gaps between these runs are 300 and 1140 minutes, both whole multiples of 60, so a 15-minute window would have reached only 25% of breaches and always the same 25% |
| Answered requests stop being reminded | Pass | Verified against live Jira 2026-09-08: 9 of 26 open DC requests have a completed first-response cycle and are excluded by `selectReminderTickets` before any window logic. Replying inside or outside the SLA both end the reminders; only an `ongoing` cycle is eligible |
| Schedule matches the delivery-window design | Superseded 2026-09-08 | The schedule was `0 0 * * *`. A daily run advances elapsed-since-breach by 1440 minutes and `1440 % 60 == 0`, so `isReminderWindow` returned the same verdict for a given ticket on every run: breaches whose age mod 60 fell outside the 15-minute window were **never** reminded, permanently, not occasionally. Reproduced against `src/reminder/sla.ts`: offsets 20 and 47 answered `no` on seven consecutive days; at `*/15 * * * *` every offset is reminded once an hour |
| Delivery path matches a working bot in this tenant | Pass | On 2026-09-08 the Graph install + chat + activity sequence was taken from `zero/goOrange`'s production edge function rather than designed here |
| Resolution metric present on DC requests | Pass | On 2026-09-07 a local dry-run scanned 28 DC requests and read the escalation clock on enough of them to select 9 crossings (L2:4, L3:3, L5:2) |
| Bot dry-run is aggregate-only | Pass | On 2026-09-07 the dry-run output named no request, assignee, or object id |

Update this table when newer evidence supersedes it. Do not mark an external
integration complete from code inspection or a local mock alone.

## Implemented baseline

- [x] Paginated Jira enhanced JQL search with result and page caps.
- [x] Paginated JSM SLA lookup with bounded concurrency.
- [x] Ongoing, breached, unpaused, in-calendar SLA selection.
- [x] Stateless reminder delivery windows with 60/15 minute defaults.
- [x] Priority and overdue ordering, followed by assignee grouping.
- [x] Deterministic Teams text generation and message chunking.
- [x] Jira and Teams request timeout and retry helper.
- [x] Optional aggregate-only Gemini prompt input.
- [x] GitHub Actions schedule and concurrency group.
- [x] OIDC/WIF wiring for optional Vertex authentication.
- [x] Local secret and service-account files ignored by Git.
- [x] Unit coverage for core adapters and pure policies.

## Milestone 1: clear release blockers

Complete these tasks before any feature expansion.

- [x] Make clean installation pass on GitHub Actions.
  - Reproduce with the exact Linux Node and npm versions used by the workflow.
  - Regenerate or correct `package-lock.json` with the chosen npm version.
  - Pin and print the package-manager version in CI so local and hosted checks agree.
  - Acceptance: a new `ci.yml` run reaches and passes test, typecheck, and build.
- [x] Make dry-run output aggregate-only.
  - Replace the returned `developers: string[]` with `developerCount: number`.
  - Ensure logs and workflow output contain no assignee, ticket key, summary, URL,
    status, or other Jira-controlled text.
  - Acceptance: a workflow-level test proves that dry-run skips Teams and exposes
    counts only.
- [x] Add orchestration tests for the release-critical branches.
  - No due tickets produces no Teams request.
  - Dry-run produces no Teams request.
  - Multiple message chunks are posted in order.
  - Teams failure fails the workflow visibly.
  - Gemini failure falls back to deterministic copy and does not block delivery.

## Milestone 2: harden external-call and input safety

- [x] Bound every wait in the external-call path.
  - Cap `Retry-After` delays instead of sleeping for an arbitrary server value.
  - Add a timeout around optional Gemini generation, or remove Gemini from the MVP.
  - Acceptance: tests cover an excessive `Retry-After` and a stalled intro writer.
- [x] Fail closed on production ticket scope.
  - Require an explicit project-scoped `JIRA_JQL` outside local dry-run use.
  - Acceptance: production configuration without `JIRA_JQL` is rejected.
- [x] Complete Jira adapter edge-case coverage.
  - Exact `JIRA_MAX_RESULTS` truncation and `truncated=true`.
  - Configured SLA metric absent from every scanned ticket.
  - SLA page cap exhaustion and mixed present/absent metrics.
  - Actual SLA lookup concurrency ceiling.
- [x] Complete message-safety coverage.
  - Neutralize renderer-sensitive angle brackets and link-like Jira text.
  - Verify every ticket appears exactly once across chunks.
  - Verify all produced messages stay within `TEAMS_MAX_MESSAGE_CHARS`.

## Milestone 3: verify production configuration

These checks require the real Jira, Teams, GitHub, and optional Google Cloud
environments. Record only names and outcomes; never copy secret values into this
document or CI logs.

- [x] Point `JIRA_JQL` at a service desk project that exists.
  - Set 2026-08-26: `project = DC AND statusCategory != Done AND assignee is not EMPTY ORDER BY priority DESC, updated ASC`. Dry-run scans real DC issues.
- [x] **Decide what an empty scan should mean.** User chose warn and succeed
      on 2026-11-03. Zero tickets now returns aggregate zero counts and no
      channel or bot sends. Workflow regression test passes. Jira errors and
      missing configured metrics on non-empty scans still fail visibly.
- [ ] **Make the resolution clock pause while waiting on the client.** Diagnosed
      2026-09-08; `npm run trace` reports `paused clocks: first response 0,
      resolution 0` and `statuses in play: Open=26`.

      The cause is a workflow gap, not an SLA setting. All nine Mongolian request
      types on service desk 69 — Доголдол, Сайжруулалт, Мэдээлэл өгсөн,
      Үйлчилгээ үзүүлсэн, Шинэ хөгжүүлэлт, Бусад, Дараах төлбөрт өөчлөлт,
      Төлөвлөгөөт ажил, Өөрчлөх хүсэлт — map to issue type **10138
      `Ask a question`**, whose workflow offers only `Open`, `In Progress`,
      `Resolved`, `Reopened`, `Closed`. There is no waiting status to move a
      request into, so a pause condition has nothing to match. The project does
      define `Waiting for customer`, `Waiting for support`, `Waiting for
      approval` and `Pending`, and issue type 10193 `[System] Service request`
      already carries the JSM set — but nothing uses it.

      Fix by editing the `Ask a question` workflow rather than remapping the
      request types: editing applies to the 26 open requests immediately, where
      a remap would only affect new ones. Check which projects share the
      workflow before editing, and copy it if it is shared.

      1. Add the existing `Waiting for customer` status to that workflow, with
         transitions in from `Open` and `In Progress` and back to `In Progress`.
      2. Add it to **Pause on** for `Time to resolution` only.
         `Time to first response` should not pause: while that cycle runs, the
         client has had no reply at all, which is exactly what the reminder is
         for.
      3. Automate the transition so it does not depend on habit — a public agent
         comment moves the request to `Waiting for customer`, a customer comment
         moves it back.
      4. Confirm with `npm run trace`: `paused clocks` stops reading 0 and the
         elapsed figures drop, because changing a metric's conditions makes JSM
         recalculate.

      No code change: `src/reminder/sla.ts` and `src/escalation/escalation.ts` already
      exclude a paused cycle, with tests. The application must not second-guess
      Jira's clock (`AGENTS.md`).
- [ ] Confirm JSM First Response goals match `for-agents/sla-matrix.md`.
- [ ] Confirm the JSM calendar is Mon-Fri 09:00-18:00 with correct holidays.
- [x] Confirm `JIRA_FIRST_RESPONSE_SLA_NAME` exactly matches the production metric.
  - Confirmed 2026-08-20 through `GET /rest/api/3/field`, which lists SLA metrics
    without needing agent permission. The instance defines `Time to first
    response`, `Time to resolution`, `Time to close after resolution`, and `Time
    to review normal change`. Metrics are named by purpose, not by duration, so a
    single configured name is correct for every priority.
- [x] Confirm the integration account can search the scoped project and read SLAs.
  - Confirmed 2026-08-26: agent access granted on DC project. `GET
    /rest/servicedeskapi/request/DC-844/sla` returns 200 OK with full SLA data
    including `elapsedTime` (working-hours elapsed time from JSM).
- [ ] Confirm the Teams webhook accepts the payload and renders escaped text.
  - The webhook is now optional; a bot-only deployment skips this check.
- [x] Confirm required GitHub secrets and variables are configured.
  - Configured 2026-09-08. The repository had **none** of either, so the nightly
    schedule could never have worked regardless of the webhook break.
    Secrets: `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`. Variables:
    `JIRA_JQL`, `JIRA_FIRST_RESPONSE_SLA_NAME`, `JIRA_RESOLUTION_SLA_NAME`,
    `TEAMS_BOT_APP_ID`, `TEAMS_BOT_TENANT_ID`, `TEAMS_BOT_RECIPIENT_ALLOWLIST`.
    Still missing: `TEAMS_BOT_APP_PASSWORD` as a secret, or the OIDC federated
    credential in its place.
- [ ] Confirm `JIRA_RESOLUTION_SLA_NAME` exactly matches the production metric.
  - `GET /rest/api/3/field` listed `Time to resolution` on 2026-08-20, which is
    the configured default; confirm it is the metric JSM actually attaches to DC
    requests.
- [ ] If Gemini is enabled, confirm WIF, Vertex IAM, region, and model access.
- [ ] Run `workflow_dispatch` with `dry_run=true` and verify aggregate-only output.

## Milestone 4: controlled rollout

- [ ] Create or identify one controlled Jira request for each relevant SLA state:
  due, paused, outside calendar, and not breached.
- [ ] Run a dry-run and compare aggregate selection with Jira.
- [ ] Run one controlled live delivery and verify Teams content and links.
- [ ] Verify a no-due run posts nothing.
- [ ] Observe at least four consecutive scheduled runs.
- [x] Verify the schedule does not repeat a reminder needlessly. Superseded
      2026-09-08: the workflow runs twice a working day, so the schedule is the
      cadence and the delivery window is deliberately open. A narrow window on a
      sparse schedule reached only 25% of breaches, always the same 25%.
- [ ] Record the successful GitHub run URLs in the evidence snapshot.
- [ ] Update the PRD status from `implemented baseline` to `production verified`.

## MVP definition of done

The MVP is done only when all of the following are true:

- [ ] Milestones 1 through 4 are complete.
- [ ] `npm ci`, `npm test`, `npm run typecheck`, and `npm run build` pass locally
  and in GitHub Actions.
- [ ] Dry-run and ordinary operational logs contain aggregate counts only.
- [ ] All external calls and retry waits are bounded.
- [ ] A controlled Jira-to-Teams delivery has succeeded.
- [ ] Scheduled execution has been observed without duplicate 15-minute posts.
- [ ] Production Jira SLA goals, calendar, metric name, and priority mapping are
  confirmed.
- [ ] No secret, token, ticket content, or personal data is present in Git history
  or GitHub Actions logs.

## V2 milestone 1: personal Teams bot delivery path

Scope: the direct-message transport only. Escalation levels, the contact
directory, and off-hours routing stay blocked on the open decisions in
`for-agents/brd-teams-bot-escalation.md`. Do not implement them here.

### Verified delivery mechanism

A one-to-one direct message was delivered end to end on 2026-08-20 from a local
shell with no hosted endpoint and no inbound request handling, which is the
property the scheduled workflow needs.

| Check | Status | Evidence |
| --- | --- | --- |
| Graph app-only chat message | Rejected | `POST /chats/{id}/messages` has no usable application permission; `ChatMessage.Send` is delegated-only |
| Bot Connector token, single tenant | Pass | client-credentials token issued against the tenant authority for the Bot Framework scope |
| Azure Bot resource | Pass | free tier, single-tenant, Teams channel enabled, messaging endpoint left empty |
| Conversation create without a bot resource | Fail, expected | `401 Authorization has been denied for this request` |
| Conversation create without a personal install | Fail, expected | `403 Bot is not installed in user's personal scope` |
| Direct message delivery | Pass | recipient confirmed the message in Teams on 2026-08-20 |
| Auto-install for other recipients | Not attempted | needs an organisation catalog publish and admin consent |
| Secretless GitHub OIDC credential | Not attempted | single-tenant authority makes it viable; untested |

Multi-tenant bot creation was deprecated after 2025-07-31, so single tenant is
the only supported app type. Cost is not a factor: the bot runs on the free tier
and Teams is a standard channel with unmetered messages.

### Prerequisites established

- [x] Azure subscription available to the integration owner.
- [x] Entra app registration, single tenant, secret held outside the repository.
      Recorded 2026-09-08: **SLA Reminder Bot**, application (client) id
      `b76bcdfb-5a16-44c4-81e0-860780daa2da`, tenant `376a710f-b223-451f-ba55-efc974d8716c`,
      supported account types "My organization only", one client secret, state
      Activated. Neither the registration's own object id nor goOrange's app id
      belongs in any of this project's configuration.
- [x] Azure Bot resource on the free tier with the Teams channel enabled.
- [x] Notification-only Teams app package scoped to personal chats.
- [x] Application installed in one personal scope by custom app upload.

### Implementation, 2026-09-07

The transport, the escalation policy, the directory resolver, the state store,
and the workflow wiring are implemented and unit tested. Nothing here is
production evidence: no message has been sent from this codebase.

| Module | What it owns |
| --- | --- |
| `src/shared/teams-bot.ts` | Bot Connector token (client secret or GitHub OIDC), conversation create, activity post, distinct 403 reasons |
| `src/escalation/escalation.ts` | `for-agents/sla-matrix.md` section 2 thresholds and section 3 routing, pure |
| `src/escalation/escalation-config.ts` | `config/escalation.json` schema, load-time referential integrity, contact resolution that fails visibly |
| `src/escalation/escalation-state.ts` | highest level notified per ticket, restored and saved through `actions/cache` |
| `src/escalation/direct-messages.ts` | who gets which message, pure |

Decisions taken during implementation, both recorded because neither was settled
by the contract:

- The escalation clock reads the JSM **resolution** metric, not elapsed time
  since the first-response breach. Both metrics come from the same SLA response,
  so the escalation clock costs no extra request.
- Low L5 has no clock mark in the contract ("only if SLA breached"), so Low never
  escalates past L4. Escalating an executive on a guessed threshold is worse than
  not escalating. **Needs client confirmation.**

Known behavioural limit: JSM pauses the first-response clock outside calendar
hours, so `withinCalendarHours` is false off-hours and the first-response direct
message is only sent inside working hours. Off-hours contact is delivered by the
escalation path, which is what contract section 3 describes.

### Remaining before bot code enters `src/`

- [x] Answer every open decision in `for-agents/brd-teams-bot-escalation.md`,
      including decisions 5 and 6 added by this milestone. Resolved
      2026-08-24: contact directory and identity mapping both live in one
      repo config file (person directory + per-project escalation-level
      mapping); off-hours step surfaces the on-call contact only, no paging
      integration; escalation state persists in a GitHub Actions cache keyed
      per ticket. See `for-agents/brd-teams-bot-escalation.md` decisions 2-6.
- [x] Design and add the config file itself (schema for the person directory
      and the per-project/team L2-L5 mapping decided above). Added 2026-09-07 as
      `config/escalation.example.json`, validated by `src/escalation/escalation-config.ts`.
      `config/escalation.json` itself is deliberately absent: the loader fails
      visibly by path rather than shipping placeholder object ids that would
      misdirect messages.
- [x] Choose the recipient installation model. **Decided 2026-08-24:** a
      Teams app setup policy assigned to a known group, over
      `TeamsAppInstallation.ReadWriteSelfForUser.All` (broader standing
      permission, on-demand install not needed). Still needs an administrator
      to publish the app package to the organisation catalog and assign the
      policy to the recipient group; not yet executed.
- [x] Decide whether a GitHub OIDC federated credential replaces the client
      secret. **Decided 2026-08-24:** yes, matching the existing Vertex
      authentication pattern — no secret to store or rotate. Still needs the
      federated credential configured on the Entra app registration; not yet
      executed.
- [ ] Resolve an Entra object id for every intended recipient (every possible
      assignee plus L2-L5 contacts) to populate the new config file. Teams
      rejects email and user principal name for proactive direct messages.
- [x] Confirm the escalation clock reads the JSM resolution metric rather than
      elapsed time since the first-response breach. Implemented 2026-09-07:
      `src/escalation/escalation.ts` reads `resolutionSla.elapsedMinutes`, which is
      JSM's working-hours elapsed time.

### Delivery path revised 2026-09-08, from a working bot in the same tenant

`zero/goOrange` is a Teams Tab + Bot already published and running in this
tenant, and it solves proactive delivery differently. Its edge function
(`supabase/functions/teams-bot/index.ts`) does not call
`POST /v3/conversations` at all:

1. Graph finds the app in the catalog by `externalId`.
2. Graph reads `/users/{oid}/teamwork/installedApps`, and **installs the app for
   that person** if it is absent.
3. Graph reads `.../installedApps/{id}/chat` for the personal chat id.
4. The Bot Connector posts one activity into that chat.

This was adopted on 2026-09-08. It changes two things previously recorded here:

- **The Teams app setup policy is no longer needed.** The decision of 2026-08-24
  chose a setup policy over `TeamsAppInstallation.ReadWrite*` because the
  standing permission looked broader. But that permission is already granted and
  consented in this tenant for goOrange, so the narrower-looking option costs an
  admin request that the broader one does not. Publishing to the organisation
  catalog is still required — Graph finds the app by its catalog entry.
- **`403 ForbiddenOperationException` stops being the common failure.** It was
  the expected outcome for anyone who had not installed the app; installing
  first removes the condition instead of reporting it.

`https://smba.trafficmanager.net/teams` is confirmed as the Bot Connector
endpoint for this tenant, and the tenant id is
`376a710f-b223-451f-ba55-efc974d8716c`, both read from goOrange's configuration.

### The code decides when a reminder may arrive

GitHub's scheduler is not a clock — measured delays of 45 to 489 minutes, a
median near two hours, and on 2026-09-09 a run that never fired. No cron
expression fixes that.

Rather than move the clock outside GitHub, which would mean standing up a
scheduler the project does not otherwise need, the decision moves into the code.
`REMINDER_WINDOWS` names the hours a message may be delivered in, and the run
checks the local clock before sending. The cron only decides when to *try*.

That inverts the reliability problem:

- a late run inside the window still delivers;
- a run delayed into the night delivers nothing, rather than waking someone;
- the cron sits at the **start** of each window, so the usual two-hour delay
  still lands inside it — three hours of room in the morning, four in the
  afternoon;
- one cron per window means at most one run can deliver in each, so "once per
  window" needs no persisted state.

What it does not fix: a delay longer than the window's width misses that window
entirely. Against the 13 measured delays, 3 exceed the morning window's three
hours and the same 3 exceed the afternoon's four — so **roughly a quarter of
attempts miss**, and both attempts missing on the same day works out at about
one day in twenty. The cost of a miss is one skipped reminder about requests
already hours overdue, which is worth accepting rather than standing up
infrastructure for.

- [ ] Record a fortnight of run times and how many windows were missed. If the
      tail turns out worse than measured, the next step is an external trigger
      calling `workflow_dispatch`, which is immediate; the code-side window
      check stays useful either way.

### V2 milestone 2: verify the bot in production

- [ ] Publish the Teams app package to the organisation catalog. Build it with
      `npm run package:teams`.
- [ ] Grant and consent the Graph application permissions:
      `TeamsAppInstallation.ReadWriteForUser.All`, `AppCatalog.Read.All`,
      `User.Read.All`.
- [ ] Configure the GitHub OIDC federated credential on the Entra app
      registration (audience `api://AzureADTokenExchange`).
- [ ] Verify the private escalation directory contains all intended object ids.
      Never commit it; deliver it through `ESCALATION_DIRECTORY_JSON` as described
      in the evidence snapshot. Prior pilot configuration is recorded there.
- [ ] Run `npm run verify:bot -- <object-id>` and record the outcome here.
- [ ] Seed the escalation state before the first live run:
      `ESCALATION_SEED_ONLY=true` with `REMINDER_DRY_RUN` unset. A dry-run on
      2026-09-07 found 9 DC requests that have already crossed a level (L2:4,
      L3:3, L5:2); without seeding, the first live run delivers all of them,
      including two to the L5 contact.
- [ ] Run `workflow_dispatch` with `dry_run=true` and confirm the direct-message
      counts look right and no identity appears in the log.
- [x] Run one controlled live delivery with the allowlist set to the two pilot
      recipients. Done 2026-09-08 from a local run: `Delivered 3 direct
      message(s) to 3 recipient(s)` covering 7 requests at L2, L3 and L5, with
      `withheld by allowlist: 0` — the directory holds only those two, so no
      other recipient was even planned.
- [x] Confirm no level is notified twice. The immediately following run reported
      `0 request(s) crossed an escalation level` and delivered nothing, against
      the state file the first run wrote.
- [ ] Seed the **Actions cache** state before the first scheduled run. The state
      written above is local; the cache is separate and starts empty, so a
      scheduled run would re-deliver all 7 without `seed_only=true` first.
- [ ] Confirm the escalation state cache survives between scheduled runs and that
      no level is notified twice.
- [ ] Confirm the Low L5 threshold question with the client.

### V2 milestone 3: monthly dashboard backend

Requirements: `for-agents/prd-monthly-dashboard.md`. Approved 2026-10-19 by the user
ahead of the open MVP milestones 3 and 4, which stay open.

- [x] Prisma schema (`SLASnapshot`, `MonthlyReport`, `ChatMessage`) applies with
      `npx prisma db push` against a local Postgres. Done 2026-10-19 against
      `postgres:16-alpine` in Docker; all three tables created.
- [x] Reminder runs capture snapshots when `DATABASE_URL` is set, without
      changing reminder behavior. Done 2026-10-19 locally: synthetic dry runs
      through `runJiraTeamsReminder` wrote 4 rows, a repeated run instant added
      none, and an unreachable database logged one warning and exited 0.
      Unit tests cover the failure path.
- [x] `GET /api/reports/:month` returns aggregated metrics from snapshots.
      Done 2026-10-19 locally: `/api/reports/2026-10` returned 3 tickets from 4
      snapshots, `2026-13` returned 400, `/health` 200 (503 with database down).
- [x] Frontend dashboard reads `/api/reports/:month` through the Vite dev proxy
      (`VITE_USE_MOCKS=1` keeps the synthetic report). Done 2026-10-21 locally:
      `/dashboard` rendered 2026-10 counts (11 tickets, 4 first-response
      breaches) from synthetic `DEMO-*` snapshots, fetch 200, no console errors.
      Team, daily trend, prior month, and response times stay empty: the API
      does not provide them.
- [x] Restore database-backed reports and exports, preserving the frontend.
      Approved 2026-11-03. Removed hardcoded report/export data and random
      archive metrics; Prisma uses the generated client and PostgreSQL adapter.
      PostgreSQL 16 check on a disposable local database passed capture,
      duplicate suppression, health, and HTTP report reads with synthetic data.
      HTTP regressions cover exports, latest snapshots, invalid inputs, empty
      data, and sanitized 503 responses. Frontend typecheck, 6 tests, and build
      passed 2026-11-03; missing snapshot typing, a missing translation, and
      pre-existing unused imports were corrected. Postman requests against the
      local server passed 2 assertions (connected health and truthful empty
      report), exit 0. The installed CLI does not support `postman status`. Optional `DATABASE_URL` secret is wired
      into the local workflow file; not deployed or configured in GitHub.
- [ ] Capture verified against a real scheduled run's database (external).

## Internal reporting completion — 2026-11-04

User authorized a research agent followed by an implementation agent to complete
features, database integration, and dashboard layouts. The implementation scope
is the internal monthly snapshot experience in `for-agents/prd-monthly-dashboard.md`;
MVP external acceptance remains open. Existing product design and MN/EN apply.

- [x] Month selection, refresh, coverage metadata, and both SLA metrics.
- [x] Missing-metric disclosure and honest observed-data labels/exports.
- [x] Bounded monthly reads; visible errors instead of truncated reports.
- [x] Implement report/archive layouts with MN/EN, theme tokens, responsive
      structure, labeled controls, reduced-motion support, and export errors.
- [x] Query/HTTP/export/frontend regressions and disposable PostgreSQL evidence.
- [x] Browser visual, viewport, and keyboard acceptance. Executed 2026-11-06
      locally (headless Chromium, synthetic data, 4 pages × 3 viewports × mn/en ×
      light/dark): 48/48 without page h-scroll; fixed tabbable off-screen mobile
      drawer, Escape/focus for the drawer, sub-44px targets, and localized
      support upload errors (server detail kept as-is). Report:
      `plan/phase-6-reporting-acceptance/reports/2026-11-06-6.1-browser.md`.
- [ ] Production database provisioning/deployment and scheduled capture (external).

Executed evidence, 2026-11-04:

- Research agent inspected code and recommended the snapshot-only scope; builder
  implemented it; parent reviewed and corrected small contrast/adapter issues.
- Pinned Node 22.19.0/npm 10.9.3 toolchain verification passed. Root `npm test`
  passed 147, failed 0, skipped 1 opt-in DB test; typecheck and build exit 0.
- Frontend `npm test` passed 10, failed 0; typecheck and build exit 0 using the
  same pinned toolchain. Build retains a ~640 KB chunk-size advisory.
- `npm run db:push` applied the existing schema to disposable PostgreSQL 16.
  Opt-in database test passed capture, duplicate suppression, health, and HTTP
  reads under pinned Node 22.19.0. No schema expansion or real Jira rows used.
- Local Postman collection passed 6 requests / 6 assertions, exit 0, with cloud
  event reporting disabled. Contract/checks: `for-agents/monthly-report-api.md`.
- A real PostgreSQL month containing 100,001 synthetic rows returned 413 for
  report, PDF, and Excel; no partial result. Fixtures were deleted afterward.
- Ad hoc server rendering verified selected month, capture dates, missing-flag
  labels, and PDF/Excel controls in MN/EN. This is not browser visual evidence.
- Historical priority schemes stay in API/export totals; the mapped chart/table
  explicitly disclose their narrower contract-priority scope.

Remaining: production PostgreSQL and `DATABASE_URL`, release of the local
changes, scheduled capture evidence, Jira pause/calendar/goals, recipient-side
Teams rendering, four controlled scheduled runs, and Low L5 business decision.
No commits, pushes, secret changes, live messages, or production deployment were
performed in this change. Local test server/database were temporary.

## Client support report generator — authorized 2026-11-05

User explicitly prioritized this ahead of remaining MVP acceptance. Requirements:
`for-agents/prd-support-report.md`. Stateless upload → per-group PDF.

- [x] `buildSupportReport` (pure, TDD, synthetic fixtures): grouping, sections, period split, penalties, hours.
      Evidence 2026-11-05: `tests/support-report/support-report.test.ts` 12 pass; root `npm test` 159 pass / 0 fail / 1 skipped;
      typecheck and build exit 0. Not yet run against a real export.
- [x] Row reader for xlsx and csv (exceljs), required-column error.
      Evidence 2026-11-05: `tests/support-report/input.test.ts` 3 pass; root `npm test` 164 pass / 0 fail /
      1 skipped; typecheck and build exit 0. Local check on the real Sept DC export (not committed): open list,
      improvements and type counts match the signed "Бусад систем" PDF; the only gap is DC-944, which staff removed
      by hand. A typo'd `Resolved at` (DC-919) now fails visibly instead of counting as open.
- [x] PDF renderer: Cyrillic TTF, bar charts, signatures.
      Evidence 2026-11-05: `tests/support-report/pdf.test.ts` pass (valid PDF, embedded Noto Sans,
      deterministic bytes, no number-only pages); root `npm test` 166 pass / 0 fail / 1 skipped; typecheck and build
      exit 0. Local render of the real Sept DC export (not committed; DC-919 typo patched, DC-944 marked `Хасах`):
      totals 43, IT 33 / Change 10, 86% / 37 resolved, 6 open, defects 15 / 12 / 3 match the signed PDF.
      Visual check at 60 dpi only; no side-by-side review by support staff yet.
- [x] Upload endpoint (in-memory) + `ReportsPage` generate form; local gitignored client configs.
      Evidence 2026-11-06: `GET /api/support-reports/configs`, `POST /api/support-reports/period`,
      `POST /api/support-reports?config&from&to&group` in `src/backend/server.ts` (10 MB raw body, 20 000-row cap → 413,
      input errors → 400 with the reason, only the status is logged); configs in gitignored
      `config/support-report/<id>.json`, synthetic `example.json.sample` committed. After a separate review
      (CHANGES-REQUESTED, all blocking findings fixed: typed `SupportInputError`, server faults → 500 without details,
      `Object.hasOwn` config lookup, one download button per group, stale-period race): `tests/backend/server.test.ts`
      9 pass; root `npm test` 171 pass / 0 fail / 1 skipped; typecheck and build exit 0; frontend `npm test` 12 pass and
      `npm run build` exit 0. Local run with a synthetic CSV: curl and the `/reports` form (agent-browser) downloaded a
      valid PDF from each group button (Cyrillic renders), and a file missing columns shows "Missing required columns: …"
      on upload with the buttons disabled.
      Not yet run against a real client export through the UI.
- [ ] Confirm `Time to first response` export format with a real sample.

## Restructure + documentation chat — authorized 2026-11-06

User asked for a feature-folder restructure (backend and frontend) and a RAG chat
over `documents/` (`for-agents/prd-docs-chat.md`). No DDD/Clean layers and no
monorepo tooling: the old `src/lib/` was already a framework-free core (split into feature folders by 2.1), and the repo is
already one git repo with two packages. Numbers match "End state and phases"
above; each item is its own commit and ends
with `npm test`, `npm run typecheck`, `npm run build` (and the frontend's
`npm test` / `npm run build` when it changes).

- [x] 0.1 gitignore `documents/` (client-confidential, public repo). Report: `plan/phase-0-clean-slate/reports/2026-11-06-0.1.md`.
- [x] 0.2 commit the current uncommitted work. Report: `plan/phase-0-clean-slate/reports/2026-11-06-0.2.md`.
- [x] 2.1 Backend feature folders. `src/shared/` (config, http, jira, teams-bot,
      teams-webhook), `src/reminder/`, `src/escalation/`, `src/monthly-report/`,
      `src/support-report/`; `agents/` and `workflows/` stay (Flue discovery);
      `backend/server.ts` keeps routes only. `tests/` mirrors it; update the
      `npm test` globs and every old `src/lib/...` path in `AGENTS.md` and `for-agents/`.
      Pure files stay framework-free; pdfkit/exceljs/express/Prisma only in
      `*-pdf`, `*-input`, `db`, `export`, `server`.
      Report: `plan/phase-2-restructure/reports/2026-11-06-2.1.md`.
- [x] 2.2 Frontend `features/` (monthly-report, support-report, reports-archive,
      chat, teams) + `shared/`; `components/ui/` stays (shadcn).
      Report: `plan/phase-2-restructure/reports/2026-11-06-2.2.md`.
- [x] 2.3 Replace the frontend's copied report types with `import type` from
      the backend's pure files; delete the copies.
      Report: `plan/phase-2-restructure/reports/2026-11-06-2.3.md`; phase: `plan/phase-2-restructure/REPORT.md`.
- [x] 3.1 Enable pgvector and add `DocChunk` to `prisma/schema.prisma`. DB change, needs user approval.
      Applied to a throwaway pgvector database only. Report: `plan/phase-3-docs-chat/reports/2026-11-06-3.1.md`.
- [x] 3.2 Pure Markdown chunker `src/docs-chat/chunk.ts` (TDD).
      Report: `plan/phase-3-docs-chat/reports/2026-11-06-3.2.md`.
- [x] 3.3 Vertex adapter (embed + generate, bounded) and `npm run docs:index`
      with content-hash skip.
      Report: `plan/phase-3-docs-chat/reports/2026-11-06-3.3.md`.
- [x] 3.4 `POST /api/chat` → embed question → top-k by cosine (optional
      client filter) → grounded answer + sources; tests with a fake adapter.
      Report: `plan/phase-3-docs-chat/reports/2026-11-06-3.4.md`.
- [x] 3.5 Wire `AdminChatPage` to the endpoint (replace the stub in
      `api-client.ts`), show sources and a client picker.
      Report: `plan/phase-3-docs-chat/reports/2026-11-06-3.5.md`.
- [x] 3.6 Live check — index the real `documents/` with the user's GCP
      project, ask known questions, record results here. Not done until executed.
      2026-11-06, user's GCP project (gcloud default), throwaway pgvector DB: 279 files → 2762 chunks
      (289 s), second run `new 0`; 6 of 7 questions correct with correct citations, one cross-lingual
      retrieval miss. Report: `plan/phase-3-docs-chat/reports/2026-11-06-3.6.md`; phase: `plan/phase-3-docs-chat/REPORT.md`.

## Hosting + auth (phase 5) — code items

Scope and reports: `plan/phase-5-hosting-auth/`. Requirements:
`prd-hosting-auth.md`. Code only; the phase closes after a real deploy.

- [x] 5.1 PRD `prd-hosting-auth.md` (auth code + PKCE, group check, signed
      session cookie, fail-closed startup, env, out of scope).
      Report: `plan/phase-5-hosting-auth/reports/2026-11-07-5.1.md`.
- [x] 5.2 Backend auth: login/callback/logout/me, session guard on `/api`,
      fail-closed startup; tests with a local signing key, no network.
      Report: `plan/phase-5-hosting-auth/reports/2026-11-07-5.2.md`.
- [x] 5.3 Frontend: 401 → `/api/auth/login`; signed-in name + sign-out in the header.
      Report: `plan/phase-5-hosting-auth/reports/2026-11-07-5.3.md`.
- [x] 5.4 Container: Dockerfile + `.dockerignore`, Express serves `frontend/dist`;
      `docker build`/`run` proof; README "Deploy (Cloud Run)" runbook (not executed).
      Report: `plan/phase-5-hosting-auth/reports/2026-11-07-5.4.md`.
- [ ] 5.5 Deploy with the user's project, tenant and group; staff log in; a
      scheduled run's snapshot appears. Waits on the user.

## Post-MVP direction

The Tech Success dashboard, Microsoft Entra group authorization, durable
notification ledger, personal Teams bot messages, read receipts, acknowledgements,
and analytics database are a separate V2. Do not add them to this MVP unless the
PRD and this roadmap are explicitly revised first.

## Agent context organization

On 2026-11-03, project requirements, SLA matrix, task list, setup/design
references, and this roadmap were consolidated in `for-agents/` at the user's
request. `AGENTS.md` remains the root entry point; `for-agents/README.md` indexes
the documents. This is a file organization change, not release acceptance.

## Roadmap update protocol

When an agent completes roadmap work, it must update this file in the same change:

1. Check only tasks supported by executed tests or external run evidence.
2. Add or replace evidence with the command result or GitHub run ID.
3. Keep unfinished or externally unverified tasks unchecked.
4. Add newly discovered release blockers to the earliest applicable milestone.
5. Do not broaden the MVP with post-MVP features while release blockers remain.
