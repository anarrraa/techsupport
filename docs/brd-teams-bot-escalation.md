# BRD: Personal Teams bot for direct reminders and contract escalation

Status: proposed (pre-implementation, V2)

## Business context

`docs/sla-matrix.md` (extracted from Хавсралт 6 of the service contract) is the
contractual source of truth. It defines per-priority first-response windows and
a five-level escalation timeline (L1 support -> L2 developer -> L3 team lead ->
L4 CTO -> L5 executive), plus different notification rules for working hours
versus off-hours.

## Business problem

The shipped MVP (`docs/prd-priority-sla-reminders.md`) posts one aggregated
message to a Teams channel every 15 minutes when tickets breach the first
response SLA. It does not:

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

1. **Bot delivery mechanism.** Sending a Teams message to a person directly
   requires either (a) a registered Bot Framework / Azure Bot Service app
   that the person has already installed or messaged, so it holds a
   conversation reference, or (b) a Microsoft Graph app-only integration with
   `Chat.Create` / `ChatMessage.Send` application permissions and tenant
   admin consent. Both are an Azure AD registration and admin-approval
   decision, not an engineering one.
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

## Out of scope (unless a decision above revises this)

- Automated phone dialing.
- A durable, exactly-once delivery ledger beyond the MVP's stateless
  delivery-window approach.
- Monthly/weekly compliance report generation (contract section 5).
- Marking a Jira ticket resolved, or advancing SLA state, from a chat reply.
