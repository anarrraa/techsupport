# BRD: Personal Teams bot for direct reminders and contract escalation

Status: proposed (V2). Delivery mechanism resolved and verified 2026-08-20;
remaining decisions still block implementation.

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
2. **Escalation contact directory.** The contract names roles (L2 developer,
   L3 team lead, L4 CTO, L5 executive), not people or Teams identities. A
   mapping from Jira project/team to a named Teams user per level does not
   exist yet and must be supplied (e.g. a config file, a Jira field) before
   any escalation message can be addressed to anyone.
3. **Off-hours phone call step.** Contract section 3 requires a phone call to
   the on-call NOC engineer for off-hours Critical/High. A chat bot cannot
   place a phone call. Decide whether the bot only surfaces the on-call
   contact for a human to call, or whether this integrates with a separate
   paging system (PagerDuty, Opsgenie, etc.) — that integration is out of
   scope unless explicitly added here.
4. **Response detection.** The escalation clock must advance on the
   contract's definition of "unresolved," which only JSM's SLA/ticket state
   can express. A person answering in chat is not a resolution signal.
   Confirm the bot is notify-only and never a source of SLA truth.
5. **Assignee and escalation identity resolution.** Teams rejects email and
   user principal name for proactive direct messages; only a Microsoft Entra
   object id works. Jira supplies an Atlassian account and, subject to
   privacy settings, an email address, and `src/lib/jira.ts` currently keeps
   only the display name. Decide where the Jira-account-to-Entra-object-id
   mapping lives, for the **assignee as well as** the L2-L5 contacts. Note
   that channel @mentions accept email or UPN, so this constraint applies to
   direct messages only.
6. **Escalation state storage.** `AGENTS.md` requires that a level already
   notified for a ticket is never notified again. A stateless delivery window
   cannot guarantee that, because a delayed or bunched scheduler run can fall
   twice inside one window. Decide where "highest level notified per ticket"
   is persisted, given that the workflow has no storage today. Options
   include a Jira issue entity property, a bot-authored Jira comment, or a
   GitHub Actions cache. This is a permissions decision as much as a design
   one, since the durable options need write access the integration account
   may not have.

## Out of scope (unless a decision above revises this)

- Automated phone dialing.
- A durable, exactly-once delivery ledger beyond the MVP's stateless
  delivery-window approach.
- Monthly/weekly compliance report generation (contract section 5).
- Marking a Jira ticket resolved, or advancing SLA state, from a chat reply.
