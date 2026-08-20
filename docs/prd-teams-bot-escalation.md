# PRD: Personal Teams bot — direct SLA reminders and contract escalation (V2)

Status: proposed, blocked on the open decisions in
`docs/brd-teams-bot-escalation.md`

## Problem

The MVP posts one aggregated Teams channel message per breach cycle. The
contract in `docs/sla-matrix.md` requires notifying the individually
responsible person and escalating through five levels (L1-L5) on a fixed
timeline, with different rules for working hours and off-hours. See
`docs/brd-teams-bot-escalation.md` for the full business case.

## Source of truth

`docs/sla-matrix.md` sections 1-3 define, per Jira priority, the
first-response window, the L1-L5 escalation timeline, and the working-hours
vs off-hours notification rules. Jira Service Management remains the sole
source of SLA breach, pause, and calendar state, unchanged from the MVP
invariant in `AGENTS.md`.

## Required behavior (proposed — implementation blocked until the BRD's open
decisions are answered)

1. On first-response SLA breach (reusing the existing due-ticket selection in
   `src/lib/sla.ts`), send a direct message to the ticket's assignee, in
   addition to the existing channel post, containing: ticket key and link,
   priority, the contractual first-response window, and an explicit request
   to respond or update the ticket now.
2. Track elapsed time since breach against the escalation timeline in
   `docs/sla-matrix.md` section 2, keyed by contract severity via the
   existing priority mapping table.
3. When a ticket remains unresolved past each level's threshold, notify the
   next level's contact (L2 -> L3 -> L4 -> L5), resolved through the contact
   directory from BRD open decision 2. Never guess or hardcode a contact.
4. Apply working-hours vs off-hours routing per contract section 3:
   sequential escalation Mon-Fri 09:00-18:00; for Critical/High off-hours,
   notify L1 and L2 in parallel and surface the on-call NOC contact
   prominently. Do not attempt to place a phone call automatically.
5. Preserve every MVP invariant: JSM as SLA source of truth, no Jira content
   to an LLM, bounded external calls, dry-run sends nothing and logs
   aggregate counts only, fail visibly when the configured SLA metric is
   missing from every scanned ticket.
6. Never send a duplicate notification for the same ticket and escalation
   level. The MVP's delivery-window mechanism
   (`REMINDER_REPEAT_MINUTES`/`REMINDER_DELIVERY_WINDOW_MINUTES`) is
   stateless by design; decide during implementation whether an equivalent
   stateless window per escalation level is sufficient or whether tracking
   "highest level already notified per ticket" requires a minimal persisted
   state. Do not add a general-purpose ledger to answer this.

## Delivery and security

- Reuses the existing GitHub Actions schedule where feasible.
- Any new Azure AD app registration, Graph permission, or Bot Framework
  credential (per BRD open decision 1) is a repository secret and must never
  appear in logs, workflow output, patches, or documentation.
- Direct-message payloads reuse the existing sanitize/escape/chunk path in
  `src/lib/reminder-message.ts` rather than a second implementation.

## Out of scope

- Automated phone calls.
- Monthly/weekly compliance reporting (contract section 5) — separate future
  PRD.
- Two-way reply parsing, or treating a chat reply as SLA-resolving —
  Jira ticket state is the only source of resolution.
- Any ledger, dashboard, or read-receipt tracking beyond what item 6 above
  strictly requires.

## Acceptance checks (draft — finalize once the BRD's open decisions are
answered)

- Escalation-level selection is unit-tested against every threshold in
  `docs/sla-matrix.md` section 2, for both working-hours and off-hours.
- Direct-message content passes through the same sanitize/escape/chunk tests
  as the existing channel message.
- Dry-run sends zero direct messages and logs counts only.
- No duplicate escalation notification is sent within one delivery window.
- `npm test`, `npm run typecheck`, and `npm run build` pass.

## Dependencies / blockers

- `docs/mvp-roadmap.md` Milestone 3 is still open: the integration account's
  JSM SLA API access currently returns `403 Forbidden`. This blocks live
  verification of V2 too, since it reads the same SLA data.
- The four open decisions in `docs/brd-teams-bot-escalation.md` must be
  answered before any implementation task in `TODO.md` starts, per the
  `AGENTS.md` scope guard.
