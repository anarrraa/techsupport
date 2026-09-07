# MVP completion roadmap

Last reviewed: 2026-09-07

## Goal

Ship the contract-based First Response SLA reminder described in
`docs/prd-priority-sla-reminders.md` as a production-verified workflow. Jira
Service Management remains the source of truth for SLA state and calendar
calculations. This roadmap tracks release readiness; the PRD tracks product
requirements.

## Current verdict

**Baseline implemented; production MVP not complete. V2 bot implemented, not
verified.**

The Jira and SLA blockers that masked each other are cleared: `JIRA_JQL` is
scoped to DC and the integration account reads SLA data. Local acceptance
commands pass, dry-run output is aggregate-only, and release-critical workflow
branches are covered.

What is left for the MVP is external verification, not code: a controlled
Jira-to-Teams delivery and observed scheduled runs (milestones 3 and 4).

The V2 personal-bot and escalation code landed on 2026-09-07 and is unit tested,
but **no message has been sent from this codebase**. It is gated on three
administrator actions — publishing the Teams app package, configuring the OIDC
federated credential, and collecting Entra object ids — tracked in V2 milestone
2 below.

## Evidence snapshot

| Check | Status | Evidence |
| --- | --- | --- |
| Toolchain matches pins | Pass | `scripts/verify-toolchain.mjs` exit 0 with Node 22.19.0 and npm 10.9.3 on 2026-08-20 |
| Clean local install | Pass | `npm ci` installed 337 packages on 2026-08-20 |
| Unit tests | Pass | `npm test`: 93 passed, 0 failed on 2026-09-07 |
| Type checking | Pass | `npm run typecheck` exit 0 on 2026-09-07 |
| Production build | Pass | `npm run build` produced `dist/server.mjs` on 2026-09-07 |
| GitHub CI | Pass | Run `30893672018` passed install, test, typecheck, and build on 2026-08-04 |
| Scheduled reminder workflow | Unverified | Workflow is active but has 0 completed runs as of 2026-08-03 |
| Scoped JQL correctness | Pass | On 2026-08-26 `JIRA_JQL` set to `project = DC AND statusCategory != Done AND assignee is not EMPTY` |
| Local production dry-run | Pass | On 2026-08-26 dry-run scans real DC issues and reaches SLA endpoint |
| JSM SLA read access | Pass | On 2026-08-26 `GET /rest/servicedeskapi/request/DC-844/sla` returns 200 OK (agent access granted) |
| First response metric name | Pass | On 2026-08-20 `GET /rest/api/3/field` lists `Time to first response`; `JIRA_FIRST_RESPONSE_SLA_NAME` matches it case-insensitively |
| Live Jira-to-Teams delivery | Not attempted | User authorized dry-run only; no Teams post was made |
| Overdue uses working hours | Pass | On 2026-08-26 `elapsedMinutes` from JSM used instead of clock time |
| Empty scan detection | Pass | On 2026-08-26 `scanned: 0` in non-dry-run mode throws visible error |
| V2 bot and escalation code | Implemented, unverified | Added 2026-09-07 with unit coverage for every `docs/sla-matrix.md` section 2 threshold; no live send |
| Live bot direct message from this codebase | Not attempted | needs `TEAMS_BOT_APP_ID`/`TEAMS_BOT_TENANT_ID` and a credential; run `npm run verify:bot -- <object-id>` |
| Teams app published to the organisation catalog | Not attempted | administrator action; per-person custom upload only proved the path on 2026-08-20 |
| GitHub OIDC federated credential on the Entra app | Not attempted | code path implemented and unit tested; the credential itself is not configured |
| `config/escalation.json` populated | Not attempted | `config/escalation.example.json` added 2026-09-07; real Entra object ids still needed |
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
- [ ] Confirm Jira priority mapping against the production priority scheme.
- [ ] Confirm JSM First Response goals match `docs/sla-matrix.md`.
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
- [ ] Confirm required GitHub secrets and variables are configured.
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
- [ ] Verify delivery-window suppression prevents a post every 15 minutes.
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
`docs/brd-teams-bot-escalation.md`. Do not implement them here.

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
- [x] Azure Bot resource on the free tier with the Teams channel enabled.
- [x] Notification-only Teams app package scoped to personal chats.
- [x] Application installed in one personal scope by custom app upload.

### Implementation, 2026-09-07

The transport, the escalation policy, the directory resolver, the state store,
and the workflow wiring are implemented and unit tested. Nothing here is
production evidence: no message has been sent from this codebase.

| Module | What it owns |
| --- | --- |
| `src/lib/teams-bot.ts` | Bot Connector token (client secret or GitHub OIDC), conversation create, activity post, distinct 403 reasons |
| `src/lib/escalation.ts` | `docs/sla-matrix.md` section 2 thresholds and section 3 routing, pure |
| `src/lib/escalation-config.ts` | `config/escalation.json` schema, load-time referential integrity, contact resolution that fails visibly |
| `src/lib/escalation-state.ts` | highest level notified per ticket, restored and saved through `actions/cache` |
| `src/lib/direct-messages.ts` | who gets which message, pure |

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

- [x] Answer every open decision in `docs/brd-teams-bot-escalation.md`,
      including decisions 5 and 6 added by this milestone. Resolved
      2026-08-24: contact directory and identity mapping both live in one
      repo config file (person directory + per-project escalation-level
      mapping); off-hours step surfaces the on-call contact only, no paging
      integration; escalation state persists in a GitHub Actions cache keyed
      per ticket. See `docs/brd-teams-bot-escalation.md` decisions 2-6.
- [x] Design and add the config file itself (schema for the person directory
      and the per-project/team L2-L5 mapping decided above). Added 2026-09-07 as
      `config/escalation.example.json`, validated by `src/lib/escalation-config.ts`.
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
      `src/lib/escalation.ts` reads `resolutionSla.elapsedMinutes`, which is
      JSM's working-hours elapsed time.

### V2 milestone 2: verify the bot in production

- [ ] Publish the Teams app package to the organisation catalog and assign a
      Teams app setup policy to the recipient group.
- [ ] Configure the GitHub OIDC federated credential on the Entra app
      registration (audience `api://AzureADTokenExchange`).
- [ ] Populate `config/escalation.json` with real object ids and commit it.
- [ ] Run `npm run verify:bot -- <object-id>` and record the outcome here.
- [ ] Seed the escalation state before the first live run:
      `ESCALATION_SEED_ONLY=true` with `REMINDER_DRY_RUN` unset. A dry-run on
      2026-09-07 found 9 DC requests that have already crossed a level (L2:4,
      L3:3, L5:2); without seeding, the first live run delivers all of them,
      including two to the L5 contact.
- [ ] Run `workflow_dispatch` with `dry_run=true` and confirm the direct-message
      counts look right and no identity appears in the log.
- [ ] Run one controlled live delivery to a single recipient.
- [ ] Confirm the escalation state cache survives between scheduled runs and that
      no level is notified twice.
- [ ] Confirm the Low L5 threshold question with the client.

## Post-MVP direction

The Tech Success dashboard, Microsoft Entra group authorization, durable
notification ledger, personal Teams bot messages, read receipts, acknowledgements,
and analytics database are a separate V2. Do not add them to this MVP unless the
PRD and this roadmap are explicitly revised first.

## Roadmap update protocol

When an agent completes roadmap work, it must update this file in the same change:

1. Check only tasks supported by executed tests or external run evidence.
2. Add or replace evidence with the command result or GitHub run ID.
3. Keep unfinished or externally unverified tasks unchecked.
4. Add newly discovered release blockers to the earliest applicable milestone.
5. Do not broaden the MVP with post-MVP features while release blockers remain.
