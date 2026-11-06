# Agent instructions

These instructions apply to the entire repository.

## Required context

`for-agents/` is the central location for agent context: requirements, contract
values, roadmap, tasks, architecture, conventions, and reference material. Start
with `for-agents/README.md` for its index. Maintain those files in that folder;
do not create duplicate roadmaps or task lists elsewhere. Paths below are
relative to the repository root.

Before planning or changing code, read these files in order:

1. `for-agents/prd-priority-sla-reminders.md` for the current MVP requirements.
2. `for-agents/roadmap.md` for current status, blockers, execution order, and the
   definition of done.
3. `for-agents/sla-matrix.md` for contractual SLA goals and explicit assumptions.
4. `README.md` for architecture, setup, commands, and operational limits.
5. `for-agents/brd-teams-bot-escalation.md` and `for-agents/prd-teams-bot-escalation.md` for
   the proposed V2 personal-bot/escalation work, if touching that scope.
6. `for-agents/TODO.md` for the current actionable task list across the MVP and V2.
7. `for-agents/gotchas.md` and `for-agents/conventions.md` before making changes;
   use `for-agents/architecture.md`, `commands.md`, `data.md`, and `env.md` as
   needed. Read `for-agents/CONTEXT.md` for the project vocabulary.
8. For dashboard work, read `for-agents/prd-monthly-dashboard.md` and the
   applicable dashboard specifications and design references listed in the index.

The PRD defines behavior. The SLA matrix defines contract values. The roadmap
defines release status and work priority. If they conflict, stop and surface the
conflict instead of guessing.

## Current priority

Finish the existing Jira JSM to Teams First Response SLA reminder MVP before
building the dashboard or other V2 features. Start with the first unchecked task
in the earliest incomplete roadmap milestone unless the user explicitly changes
the priority.

## Non-negotiable invariants

- Jira Service Management owns SLA goals, working calendars, pauses, holidays,
  and breach state. Do not recreate SLA age or calendar math from issue timestamps.
- Only an ongoing, breached, unpaused cycle inside calendar hours is eligible.
- Jira-controlled content must not be sent to an LLM. Optional model input is
  aggregate counts only.
- Dry-run mode must not post to Teams or expose ticket content or identities in
  logs or workflow output.
- External requests, pagination, concurrency, retries, and retry waits must be
  explicitly bounded.
- A missing configured SLA metric across all scanned tickets must fail visibly.
- Keep `.env`, `.env.*`, service-account files, tokens, and webhook URLs out of
  source, patches, test fixtures, logs, and documentation.

## Working protocol

- Make the smallest change that completes one roadmap acceptance criterion.
- Preserve the existing module seams unless a testability requirement justifies a
  change.
- Add or update tests for changed behavior, especially workflow side effects and
  privacy guarantees. Tests belong in `tests/`, mirroring `src/`; a `*.test.ts`
  inside `src/agents/` or `src/workflows/` breaks Flue's module discovery.
- Feature-folder files (`src/shared/`, `src/reminder/`, `src/escalation/`,
  `src/monthly-report/`, `src/support-report/`) stay framework-free so the unit
  suite stays fast, except these adapters: `@flue/runtime` only in `src/agents/`
  and `src/workflows/`; express only in `src/backend/server.ts`; pdfkit only in
  `src/monthly-report/export.ts` and `src/support-report/pdf.ts`; exceljs only in
  `src/monthly-report/export.ts` and `src/support-report/input.ts`; Prisma only in
  `src/backend/db.ts`.
- Do not claim an integration works without an executed external check.
- Do not inspect or print `.env` or `gcp-sa.json`; use `.env.example` for variable
  names and documentation.
- Do not commit or push unless the user explicitly asks.

## Required verification

For implementation changes, run:

```sh
npm test
npm run typecheck
npm run build
```

Run `npm ci` when dependency metadata changes or when validating clean-install
behavior. For deployment changes, inspect the resulting GitHub Actions run and do
not treat local success as production evidence.

## Documentation updates

When roadmap work is completed:

- Update `for-agents/roadmap.md` in the same change.
- Check a task only when its acceptance condition has evidence.
- Write a report to `for-agents/plan/phase-<n>-<name>/reports/` for every
  finished item, and `REPORT.md` when a phase closes. Format and rules:
  `for-agents/plan/README.md`. Link the report from the checked roadmap item.
- Refresh the evidence snapshot when a newer local or GitHub result supersedes it.
- Keep the PRD focused on requirements; keep progress and run evidence in the
  roadmap.

## Scope guard

The dashboard, analytics database, Microsoft Entra group login, personal Teams
bot, durable delivery ledger, read receipts, and acknowledgements are post-MVP V2
work. They require an explicit PRD and roadmap update before implementation.

The personal Teams bot / escalation feature cleared that gate: every open
decision in `for-agents/brd-teams-bot-escalation.md` is answered, `for-agents/roadmap.md`
carries the V2 milestones, and the implementation landed on 2026-09-07
(`src/shared/teams-bot.ts`, `src/escalation/escalation.ts`, `escalation-config.ts`,
`escalation-state.ts`, `direct-messages.ts`). Bot transport has recorded live
message delivery (2026-09-08 and scheduled evidence checked 2026-11-03).
Full production acceptance remains open; use the current roadmap evidence rather
than interpreting historical unchecked prerequisites as current failures.

The monthly internal reporting experience is also authorized in
`for-agents/prd-monthly-dashboard.md` and `for-agents/roadmap.md`, reconfirmed
2026-11-04. It uses stored observations and preserves Jira as SLA authority.
Client access, authentication deployment, live ownership/operations telemetry,
and model summaries remain separate scope.

These invariants apply to that code in addition to the ones above:

- Never hardcode or guess an escalation contact (L2-L5). Resolve every
  recipient through the directory the user supplies; fail visibly if a level's
  contact is missing rather than silently skipping or misdirecting it.
- Never attempt to place a phone call or drive a paging system that hasn't
  been explicitly approved in the BRD. Surface the on-call contact; a human
  places the call.
- Never treat a chat reply as evidence that a ticket's SLA is satisfied. Jira
  remains the only source of resolution state.
- Escalating to a level must not re-send the notification for a level already
  notified for that ticket.
