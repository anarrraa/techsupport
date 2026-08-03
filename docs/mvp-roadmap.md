# MVP completion roadmap

Last reviewed: 2026-08-03

## Goal

Ship the contract-based First Response SLA reminder described in
`docs/prd-priority-sla-reminders.md` as a production-verified workflow. Jira
Service Management remains the source of truth for SLA state and calendar
calculations. This roadmap tracks release readiness; the PRD tracks product
requirements.

## Current verdict

**Baseline implemented; production MVP not complete.**

The Jira adapter, SLA selection policy, deterministic message builder, Teams
webhook adapter, scheduled workflow, and unit tests exist. Local acceptance
commands pass, but the current GitHub CI run is red and the scheduled production
workflow has not completed a run. Dry-run output also exposes assignee names,
which conflicts with the aggregate-only logging requirement.

## Evidence snapshot

| Check | Status | Evidence |
| --- | --- | --- |
| Clean local install | Pass | `npm ci` passed on 2026-08-03 |
| Unit tests | Pass | `npm test`: 19 passed, 0 failed on 2026-08-03 |
| Type checking | Pass | `npm run typecheck` passed on 2026-08-03 |
| Production build | Pass | `npm run build` produced `dist/server.mjs` on 2026-08-03 |
| GitHub CI | Fail | Run `30794553488` failed at `npm ci` with lockfile sync errors |
| Scheduled reminder workflow | Unverified | Workflow is active but has 0 completed runs as of 2026-08-03 |
| Live Jira-to-Teams delivery | Unverified | No controlled production delivery evidence recorded |

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

- [ ] Make clean installation pass on GitHub Actions.
  - Reproduce with the exact Linux Node and npm versions used by the workflow.
  - Regenerate or correct `package-lock.json` with the chosen npm version.
  - Pin and print the package-manager version in CI so local and hosted checks agree.
  - Acceptance: a new `ci.yml` run reaches and passes test, typecheck, and build.
- [ ] Make dry-run output aggregate-only.
  - Replace the returned `developers: string[]` with `developerCount: number`.
  - Ensure logs and workflow output contain no assignee, ticket key, summary, URL,
    status, or other Jira-controlled text.
  - Acceptance: a workflow-level test proves that dry-run skips Teams and exposes
    counts only.
- [ ] Add orchestration tests for the release-critical branches.
  - No due tickets produces no Teams request.
  - Dry-run produces no Teams request.
  - Multiple message chunks are posted in order.
  - Teams failure fails the workflow visibly.
  - Gemini failure falls back to deterministic copy and does not block delivery.

## Milestone 2: harden external-call and input safety

- [ ] Bound every wait in the external-call path.
  - Cap `Retry-After` delays instead of sleeping for an arbitrary server value.
  - Add a timeout around optional Gemini generation, or remove Gemini from the MVP.
  - Acceptance: tests cover an excessive `Retry-After` and a stalled intro writer.
- [ ] Fail closed on production ticket scope.
  - Require an explicit project-scoped `JIRA_JQL` outside local dry-run use.
  - Acceptance: production configuration without `JIRA_JQL` is rejected.
- [ ] Complete Jira adapter edge-case coverage.
  - Exact `JIRA_MAX_RESULTS` truncation and `truncated=true`.
  - Configured SLA metric absent from every scanned ticket.
  - SLA page cap exhaustion and mixed present/absent metrics.
  - Actual SLA lookup concurrency ceiling.
- [ ] Complete message-safety coverage.
  - Neutralize renderer-sensitive angle brackets and link-like Jira text.
  - Verify every ticket appears exactly once across chunks.
  - Verify all produced messages stay within `TEAMS_MAX_MESSAGE_CHARS`.

## Milestone 3: verify production configuration

These checks require the real Jira, Teams, GitHub, and optional Google Cloud
environments. Record only names and outcomes; never copy secret values into this
document or CI logs.

- [ ] Confirm Jira priority mapping against the production priority scheme.
- [ ] Confirm JSM First Response goals match `docs/sla-matrix.md`.
- [ ] Confirm the JSM calendar is Mon-Fri 09:00-18:00 with correct holidays.
- [ ] Confirm `JIRA_FIRST_RESPONSE_SLA_NAME` exactly matches the production metric.
- [ ] Confirm the integration account can search the scoped project and read SLAs.
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
