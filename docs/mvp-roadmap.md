# MVP completion roadmap

Last reviewed: 2026-08-20

## Goal

Ship the contract-based First Response SLA reminder described in
`docs/prd-priority-sla-reminders.md` as a production-verified workflow. Jira
Service Management remains the source of truth for SLA state and calendar
calculations. This roadmap tracks release readiness; the PRD tracks product
requirements.

## Current verdict

**Baseline implemented; production MVP not complete.**

The implementation and local release-hardening work are complete. Local
acceptance commands pass, dry-run output is aggregate-only, release-critical
workflow branches are covered, and GitHub CI is green.

Two external blockers remain, and they mask each other. The configured
`JIRA_JQL` matches zero issues, so the workflow dry-run completes successfully
having scanned nothing. Probing the SLA endpoint directly shows the second
blocker: the integration account cannot read SLA data. Until the query is
scoped correctly, a healthy-looking run proves nothing.

## Evidence snapshot

| Check | Status | Evidence |
| --- | --- | --- |
| Toolchain matches pins | Pass | `scripts/verify-toolchain.mjs` exit 0 with Node 22.19.0 and npm 10.9.3 on 2026-08-20 |
| Clean local install | Pass | `npm ci` installed 337 packages on 2026-08-20 |
| Unit tests | Pass | `npm test`: 44 passed, 0 failed on 2026-08-20 |
| Type checking | Pass | `npm run typecheck` exit 0 on 2026-08-20 |
| Production build | Pass | `npm run build` produced `dist/server.mjs` on 2026-08-20 |
| GitHub CI | Pass | Run `30893672018` passed install, test, typecheck, and build on 2026-08-04 |
| Scheduled reminder workflow | Unverified | Workflow is active but has 0 completed runs as of 2026-08-03 |
| Scoped JQL correctness | Fail | On 2026-08-20 the configured `JIRA_JQL` matched zero issues; it targets a project key absent from the tenant. Broader queries return results, so search itself works |
| Local production dry-run | Inconclusive | On 2026-08-20 `REMINDER_DRY_RUN=true npm run remind` completed with `scanned: 0`. It never reached the SLA endpoint, so a passing run currently carries no information |
| JSM SLA read access | Blocked | Probed directly on 2026-08-20: project search, `servicedeskapi/servicedesk`, and issue search return `200`; `servicedeskapi/request/{key}/sla` returns `403 Forbidden` on both `DC` and `SHT` |
| First response metric name | Pass | On 2026-08-20 `GET /rest/api/3/field` lists `Time to first response`; `JIRA_FIRST_RESPONSE_SLA_NAME` matches it case-insensitively. `Time to resolution` also exists |
| Live Jira-to-Teams delivery | Not attempted | User authorized dry-run only; no Teams post was made |

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

- [ ] Point `JIRA_JQL` at a service desk project that exists. As of 2026-08-20 it
      matches zero issues. The tenant's JSM projects are `APUT`, `DC`, `SHT`, and
      `AM`; `DC` and `SHT` have open issues.
- [ ] Confirm Jira priority mapping against the production priority scheme.
- [ ] Confirm JSM First Response goals match `docs/sla-matrix.md`.
- [ ] Confirm the JSM calendar is Mon-Fri 09:00-18:00 with correct holidays.
- [x] Confirm `JIRA_FIRST_RESPONSE_SLA_NAME` exactly matches the production metric.
  - Confirmed 2026-08-20 through `GET /rest/api/3/field`, which lists SLA metrics
    without needing agent permission. The instance defines `Time to first
    response`, `Time to resolution`, `Time to close after resolution`, and `Time
    to review normal change`. Metrics are named by purpose, not by duration, so a
    single configured name is correct for every priority.
- [ ] Confirm the integration account can search the scoped project and read SLAs.
  - Current evidence (2026-08-20): the account can list projects, list service
    desks, and search issues in `DC` and `SHT`, but `GET
    /rest/servicedeskapi/request/{key}/sla` returns `403 Forbidden` for both.
    Read access to SLA data is an agent-level permission in Jira Service
    Management, so portal or browse access is not sufficient.
  - Required action: add the integration account as an **agent** on the service
    desk projects in scope, then repeat this probe. Note that a JSM agent role
    consumes a licensed seat.
  - Also blocked behind this 403: confirming that `ongoingCycle` exposes
    `elapsedTime`, which both the overdue-duration display and the V2 escalation
    clock need.
- [ ] Confirm the Teams webhook accepts the payload and renders escaped text.
- [ ] Confirm required GitHub secrets and variables are configured.
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

### Remaining before bot code enters `src/`

- [ ] Answer every open decision in `docs/brd-teams-bot-escalation.md`, including
      decisions 5 and 6 added by this milestone.
- [ ] Choose the recipient installation model. Per-person custom app upload does
      not scale and depends on a permission most accounts lack. The supported
      options are a Teams app setup policy that installs the app for a known
      group, or `TeamsAppInstallation.ReadWriteSelfForUser.All` so the workflow
      installs the app for any recipient on demand. Both require one
      organisation catalog publish by an administrator.
- [ ] Decide whether a GitHub OIDC federated credential replaces the client
      secret, matching the existing Vertex authentication pattern.
- [ ] Resolve an Entra object id for every intended recipient. Teams rejects
      email and user principal name for proactive direct messages.
- [ ] Confirm the escalation clock reads the JSM resolution metric rather than
      elapsed time since the first-response breach.

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
