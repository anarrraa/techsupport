# TODO

Last updated: 2026-08-20

This tracks actionable next steps across the shipped MVP and the proposed V2
(personal Teams bot + contract escalation). See `AGENTS.md` for required
reading order and non-negotiable invariants before touching any of this.

## Now — blocking, in order

- [ ] Resolve the MVP's production blocker in `docs/mvp-roadmap.md` Milestone
      3: the Jira integration account's JSM SLA API access returns
      `403 Forbidden`. Grant it permission to view the scoped requests and
      their SLA information, then re-run the local dry-run.
- [ ] Get the user's answers to the 4 open decisions in
      `docs/brd-teams-bot-escalation.md`:
  - [ ] Bot delivery mechanism: Bot Framework/Azure Bot Service vs Microsoft
        Graph app-only messaging (Azure AD registration + admin consent
        either way).
  - [ ] Escalation contact directory: who is L2/L3/L4/L5 as a real Teams
        identity, and where does that mapping live.
  - [ ] Off-hours phone-call step: bot surfaces the on-call contact only, or
        integrates with a paging system (and if so, which one).
  - [ ] Response detection: confirm the bot is notify-only and never a
        source of SLA truth.
- [ ] Once answered, add a V2 milestone to `docs/mvp-roadmap.md` before
      writing any bot code (`AGENTS.md` scope guard).

## Next — once the blockers above are cleared

- [ ] Design the per-escalation-level "already notified" tracking: a
      stateless delivery-window equivalent to `src/lib/sla.ts`, or a minimal
      persisted marker if that's not sufficient (PRD required-behavior item
      6 in `docs/prd-teams-bot-escalation.md`).
- [ ] Build the contact-directory resolver from the source the user picks in
      open decision 2. Fail visibly on a missing contact; never guess one.
- [ ] Implement the direct-message sender, reusing the existing
      sanitize/escape/chunk path in `src/lib/reminder-message.ts` rather than
      writing a second one.
- [ ] Implement working-hours vs off-hours routing per `docs/sla-matrix.md`
      section 3 (sequential vs parallel + on-call surfacing).
- [ ] Add unit tests for every threshold in `docs/sla-matrix.md` section 2,
      for both working-hours and off-hours.
- [ ] Add workflow tests: no duplicate escalation within one delivery window,
      dry-run sends zero direct messages and logs counts only.
- [ ] Run `npm test`, `npm run typecheck`, `npm run build` before calling any
      of the above done.

## Reference

- Contract SLA/escalation values: `docs/sla-matrix.md`
- Shipped MVP behavior and status: `docs/prd-priority-sla-reminders.md`,
  `docs/mvp-roadmap.md`
- V2 business case: `docs/brd-teams-bot-escalation.md`
- V2 product spec: `docs/prd-teams-bot-escalation.md`
