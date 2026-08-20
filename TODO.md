# TODO

Last updated: 2026-08-20

This tracks actionable next steps across the MVP and the proposed V2
(personal Teams bot + contract escalation). See `AGENTS.md` for required
reading order and non-negotiable invariants before touching any of this.

## Now — blocking, in order

- [ ] Point `JIRA_JQL` at a service desk project that exists. As of 2026-08-20
      it matches zero issues, so the dry-run completes having scanned nothing
      and every other check downstream is untested. The tenant's JSM projects
      are `APUT`, `DC`, `SHT`, and `AM`; `DC` and `SHT` have open issues.
- [ ] Give the Jira integration account **agent** access on the service desk
      projects in scope. `GET /rest/servicedeskapi/request/{key}/sla` returns
      `403 Forbidden` on `DC` and `SHT` while project search, service desk
      listing, and issue search all return `200`, so SLA data is the only thing
      being refused and that is an agent-level permission. A JSM agent role
      consumes a licensed seat. V2 reads the same SLA data, so this blocks both.
      Re-run `scratchpad/jira-sla-check.mjs` to confirm.
- [ ] Get an administrator to publish the Teams app package to the
      organisation catalog, and pick the recipient installation model:
      a Teams app setup policy for a known group, or
      `TeamsAppInstallation.ReadWriteSelfForUser.All` so the workflow installs
      the app per recipient on demand. Per-person custom app upload is a spike
      technique, not a deployment model. See the V2 milestone in
      `docs/mvp-roadmap.md`.
- [ ] Get the user's answers to the open decisions in
      `docs/brd-teams-bot-escalation.md`:
  - [x] Bot delivery mechanism. **Resolved 2026-08-20 by executed test.**
        Graph app-only chat messaging does not exist; a Bot Framework bot is
        the only option, and a direct message was delivered successfully.
  - [ ] Escalation contact directory: who is L2/L3/L4/L5 as a real Teams
        identity, and where does that mapping live.
  - [ ] Off-hours phone-call step: bot surfaces the on-call contact only, or
        integrates with a paging system (and if so, which one).
  - [ ] Response detection: confirm the bot is notify-only and never a
        source of SLA truth. The JSM resolution metric's ongoing cycle is the
        available "unresolved" signal.
  - [ ] Identity resolution (decision 5): where the Jira-account-to-Entra
        -object-id mapping lives, for the assignee as well as L2-L5. Teams
        rejects email and UPN for proactive direct messages.
  - [ ] Escalation state storage (decision 6): where "highest level notified
        per ticket" persists. A stateless window cannot satisfy the
        no-duplicate invariant in `AGENTS.md`.
- [x] Add a V2 milestone to `docs/mvp-roadmap.md` before writing any bot code
      (`AGENTS.md` scope guard). Added 2026-08-20 with the verified delivery
      evidence and the Azure prerequisites already established.

## Done — V2 delivery path prerequisites

Verified 2026-08-20. Details and evidence in `docs/mvp-roadmap.md`.

- [x] Azure subscription available.
- [x] Entra app registration, single tenant, secret held outside the repository.
- [x] Azure Bot resource, free tier, Teams channel enabled, no messaging
      endpoint. Confirms no App Service or other hosting is required.
- [x] Notification-only Teams app package, personal scope.
- [x] One direct message delivered and confirmed by the recipient.

## MVP defects found 2026-08-20

Neither depends on an external grant. Both are in MVP scope, so the V2 scope
guard does not apply.

- [ ] Make an empty scan loud. `scanned: 0` currently exits successfully, so a
      misconfigured query and a genuinely quiet queue are indistinguishable in
      the logs and in GitHub Actions. This is what hid the `JIRA_JQL` fault.
- [ ] Report overdue time in working hours. `overdueMinutes` in `src/lib/sla.ts`
      subtracts the breach timestamp from the current time, so a Friday evening
      breach reads as tens of hours overdue on Monday when the contractual
      figure is minutes. It also skews the secondary sort. Read `elapsedTime`
      from the JSM metric instead, which keeps calendar arithmetic in Jira as
      `AGENTS.md` requires. Verification needs the agent grant above.

## Next — once the blockers above are cleared

- [ ] Implement the escalation-state store chosen in decision 6. The design
      question moved into the blocking list above, because every durable
      option needs a write permission that is not granted yet.
- [ ] Build the contact-directory resolver from the source the user picks in
      open decision 2. Fail visibly on a missing contact; never guess one.
- [ ] Implement the direct-message sender against the call sequence recorded in
      the V2 milestone. Parameterise the escape target in
      `src/lib/reminder-message.ts` rather than writing a second renderer; the
      bot payload is not escaped like the channel webhook. Handle
      `403 ForbiddenOperationException` and `403 MessageWritesBlocked`
      distinctly.
- [ ] Implement working-hours vs off-hours routing per `docs/sla-matrix.md`
      section 3 (sequential vs parallel + on-call surfacing).
- [ ] Add unit tests for every threshold in `docs/sla-matrix.md` section 2,
      for both working-hours and off-hours. Read elapsed working time from the
      JSM resolution metric; do not derive it from the first-response breach
      timestamp.
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
