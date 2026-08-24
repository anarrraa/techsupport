# BRD: Personal Teams bot for direct reminders and contract escalation

Status: proposed (V2). Delivery mechanism resolved and verified 2026-08-20; all
six open decisions resolved 2026-08-24. Implementation is still blocked on the
infrastructure/admin follow-ups tracked in the V2 milestone in
`docs/mvp-roadmap.md` (recipient installation model, per-recipient Entra
object ids, and the config file itself) — see `AGENTS.md` scope guard.

## Business context

`docs/sla-matrix.md` (extracted from Хавсралт 6 of the service contract) is the
contractual source of truth. It defines per-priority first-response windows and
a five-level escalation timeline (L1 support -> L2 developer -> L3 team lead ->
L4 CTO -> L5 executive), plus different notification rules for working hours
versus off-hours.

## Business problem

The MVP (`docs/prd-priority-sla-reminders.md`) posts one aggregated message to a
Teams channel when tickets breach the first response SLA. The workflow is
scheduled every 15 minutes, but each breach has one delivery window per repeat
interval, 60 minutes by default. The MVP is an implemented baseline, not yet
production verified; see `docs/mvp-roadmap.md`. It does not:

- address the individually responsible person directly,
- escalate to the next contractual level when a ticket stays unresolved,
- distinguish working-hours sequential escalation from off-hours parallel
  notify + phone call for Critical/High (contract section 3),
- produce the monthly/weekly compliance reporting the contract requires
  (section 5).

This leaves a gap between what the contract obligates and what the channel
post achieves: it depends on someone watching the channel rather than the
responsible person being asked directly.

## Business goals

1. Reduce first-response SLA breaches by notifying the responsible person
   directly instead of only the channel.
2. Meet the contract's L1-L5 escalation timeline automatically.
3. Preserve the MVP's privacy and safety guarantees: no ticket content to an
   LLM, dry-run sends nothing, all external calls bounded.
4. Lay groundwork for the contract's monthly/weekly reporting obligation
   (separate future PRD; not built here).

## Stakeholders

- Technical Success team — owns contract compliance and reporting.
- Developers / assignees — L1/L2 recipients of direct reminders.
- Team leads, CTO, executive — L3-L5 escalation recipients. Contacts are not
  yet defined; see open decision 2.
- NOC on-call engineer — off-hours Critical/High parallel contact.

## Success measures

- Every first-response breach produces a direct message to the assignee
  within one scheduled run.
- An unresolved breach escalates to the correct contractual level within the
  correct time window, without duplicate notifications inside one delivery
  window.
- No regression to the existing channel reminder, dry-run safety, or
  determinism guarantees.

## Constraints carried over from the MVP

- Jira Service Management remains the source of truth for SLA state,
  calendar, and pauses; this feature must not recompute breach state.
- Jira-controlled content must not reach an LLM.
- Dry-run must send no direct message and expose no identities.
- Every external call stays bounded: timeout, retries, pagination,
  concurrency.

## Open business decisions

Implementation must not start until these are answered.

1. ~~**Bot delivery mechanism.**~~ **Resolved 2026-08-20 by executed test.**
   There was no choice to make. Microsoft Graph app-only chat messaging does
   not exist: `POST /chats/{id}/messages` lists `ChatMessage.Send` as
   delegated-only, and its single application permission,
   `Teamwork.Migrate.All`, applies only to chats in migration mode. A
   registered Bot Framework bot is the only mechanism that can direct-message
   a person from an unattended job. A working direct message was delivered on
   2026-08-20; see the V2 milestone in `docs/mvp-roadmap.md`.

   The prerequisite chain is longer than this document originally stated. It
   is an **Azure subscription**, then an Entra app registration, then an
   Azure Bot resource with the Teams channel enabled, then a Teams app
   package, then per-recipient installation. Cost is not the obstacle: the
   bot resource runs on the free tier and Teams is a standard channel with
   unmetered messages. Approval is the obstacle.
2. ~~**Escalation contact directory.**~~ **Resolved 2026-08-24 by user
   decision.** A config file in this repo maps Jira project/team to a named
   Teams contact per level (L2-L5). The same file also serves decision 5
   below, since both are identity lookups against the same directory. It must
   be a file the workflow reads at run time, not a hardcoded mapping in
   `src/lib/`; a missing level's entry fails visibly rather than guessing
   (`AGENTS.md`).
3. ~~**Off-hours phone call step.**~~ **Resolved 2026-08-24 by user decision.**
   The bot surfaces the on-call NOC contact in the escalation message; a
   human places the call. No paging system integration (PagerDuty, Opsgenie,
   or similar) is in scope. Automated phone dialing stays out of scope per
   the section below.
4. ~~**Response detection.**~~ **Resolved by project invariant**, not a
   choice: `AGENTS.md` already requires the bot be notify-only and never a
   source of SLA truth, and forbids treating a chat reply as evidence of
   resolution. This decision existed to flag the constraint, not to select
   among alternatives.
5. ~~**Assignee and escalation identity resolution.**~~ **Resolved
   2026-08-24 by user decision.** The same config file from decision 2 maps
   every relevant Jira identity — both dynamic assignees and the fixed L2-L5
   contacts — to a Microsoft Entra object id. The file therefore needs two
   sections: a person directory (Jira account -> Entra object id, covering
   every possible assignee) and a per-project/team escalation-level mapping
   that references entries in that directory. Object ids must be collected
   and kept current by whoever maintains the file; there is no run-time Graph
   lookup.
6. ~~**Escalation state storage.**~~ **Resolved 2026-08-24 by user decision.**
   "Highest level notified per ticket" is persisted in a GitHub Actions
   cache, keyed per ticket. This needs no additional Jira write permission,
   at the accepted cost that a cache eviction or workflow/cache-key rename
   can lose the record and risk a duplicate notification — acceptable because
   the alternative (Jira entity property or comment writes) needs permissions
   the integration account does not have today.

## Out of scope (unless a decision above revises this)

- Automated phone dialing.
- A durable, exactly-once delivery ledger beyond the MVP's stateless
  delivery-window approach.
- Monthly/weekly compliance report generation (contract section 5).
- Marking a Jira ticket resolved, or advancing SLA state, from a chat reply.
