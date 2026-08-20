# Agent instructions

These instructions apply to the entire repository.

## Required context

Before planning or changing code, read these files in order:

1. `docs/prd-priority-sla-reminders.md` for the current MVP requirements.
2. `docs/mvp-roadmap.md` for current status, blockers, execution order, and the
   definition of done.
3. `docs/sla-matrix.md` for contractual SLA goals and explicit assumptions.
4. `README.md` for architecture, setup, commands, and operational limits.
5. `docs/brd-teams-bot-escalation.md` and `docs/prd-teams-bot-escalation.md` for
   the proposed V2 personal-bot/escalation work, if touching that scope.
6. `TODO.md` for the current actionable task list across the MVP and V2.

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
  privacy guarantees.
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

- Update `docs/mvp-roadmap.md` in the same change.
- Check a task only when its acceptance condition has evidence.
- Refresh the evidence snapshot when a newer local or GitHub result supersedes it.
- Keep the PRD focused on requirements; keep progress and run evidence in the
  roadmap.

## Scope guard

The dashboard, analytics database, Microsoft Entra group login, personal Teams
bot, durable delivery ledger, read receipts, and acknowledgements are post-MVP V2
work. They require an explicit PRD and roadmap update before implementation.

The personal Teams bot / escalation feature now has a BRD and PRD
(`docs/brd-teams-bot-escalation.md`, `docs/prd-teams-bot-escalation.md`), but
that only satisfies the "explicit PRD" gate — it does not clear it for
implementation. Do not write bot code until:

- every open decision listed in `docs/brd-teams-bot-escalation.md` has an
  answer from the user (bot delivery mechanism, escalation contact directory,
  off-hours phone-call handling, response-detection scope), and
- `docs/mvp-roadmap.md` has a V2 milestone reflecting those answers.

Once implementation starts, these invariants apply in addition to the ones
above:

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
