# TODO

Last updated: 2026-09-07

This tracks actionable next steps across the MVP and the proposed V2
(personal Teams bot + contract escalation). See `AGENTS.md` for required
reading order and non-negotiable invariants before touching any of this.

## Now — blocking, in order

- [x] Point `JIRA_JQL` at a service desk project that exists.
  - Done 2026-08-26: set to `project = DC AND statusCategory != Done AND assignee is not EMPTY`.
- [x] Give the Jira integration account **agent** access on the service desk
      projects in scope.
  - Done 2026-08-26: agent access granted on DC. `GET
    /rest/servicedeskapi/request/DC-844/sla` returns 200 OK.
- [x] Make an empty scan loud. `scanned: 0` now exits with error in non-dry-run mode.
- [x] Report overdue time in working hours. `overdueMinutes` now reads `elapsedTime`
      from JSM metric instead of clock time.
- [ ] Point the manifest's `developer.privacyUrl` and `termsOfUseUrl` at pages
      that actually resolve, and swap the placeholder icons in
      `packages/teams-app/` for the real brand marks. Catalog publish validates
      both.
- [ ] Get an administrator to publish the Teams app package to the
      organisation catalog. Build it with
      `TEAMS_BOT_APP_ID=<guid> npm run package:teams`. **No Teams app setup
      policy is needed** — superseded 2026-09-08 by the goOrange delivery path,
      which installs the app per recipient through Graph. See the revision note
      in `docs/mvp-roadmap.md`.
- [ ] Grant and consent the Graph application permissions on the app
      registration: `TeamsAppInstallation.ReadWriteForUser.All`,
      `AppCatalog.Read.All`, and `User.Read.All` (for `npm run resolve:ids`).
      goOrange already holds these in this tenant, so the pattern is approved.
- [ ] Configure a GitHub OIDC federated credential on the Entra app
      registration (decided 2026-08-24, matching the existing Vertex
      authentication pattern) instead of a client secret. Audience
      `api://AzureADTokenExchange`, subject
      `repo:<owner>/<repo>:ref:refs/heads/main`. The code path exists and is
      unit tested; only the credential is missing.
- [ ] Fill in `config/escalation.json`: it already carries both pilot
      recipients' emails and real Jira account ids, so
      `npm run resolve:ids` fills the rest. Commit it — GitHub Actions reads it
      from the repository.
- [ ] Prove the transport from this codebase:
      `npm run verify:bot -- <entra-object-id>`. Record the outcome in the
      evidence snapshot in `docs/mvp-roadmap.md`.
- [ ] Stage the first live run to `anar@zerotech.mn` and `tergel@zerotech.mn`
      only: resolve both to Entra object ids and set them as the
      `TEAMS_BOT_RECIPIENT_ALLOWLIST` repository variable. Widen it once the
      messages read the way they should.
- [ ] Seed the escalation state before the first live run
      (`ESCALATION_SEED_ONLY=true`, `REMINDER_DRY_RUN` unset). The 2026-09-07
      dry-run found 9 DC requests already past a level, two of them past L5.
      Without this the first live run delivers the whole backlog at once.
- [ ] Confirm with the client what Low L5 means. The contract gives it no clock
      mark ("only if SLA breached"), so Low currently never escalates past L4.
- [x] Get the user's answers to the open decisions in
      `docs/brd-teams-bot-escalation.md`. All six resolved as of 2026-08-24:
  - [x] Bot delivery mechanism. **Resolved 2026-08-20 by executed test.**
        Graph app-only chat messaging does not exist; a Bot Framework bot is
        the only option, and a direct message was delivered successfully.
  - [x] Escalation contact directory: a repo config file maps Jira
        project/team to a named Teams contact per level (L2-L5).
  - [x] Off-hours phone-call step: bot surfaces the on-call contact only; no
        paging-system integration.
  - [x] Response detection: already settled by the `AGENTS.md` invariant —
        notify-only, chat replies are never a resolution signal.
  - [x] Identity resolution (decision 5): the same config file as the contact
        directory maps every assignee and every L2-L5 contact's Jira identity
        to a Microsoft Entra object id.
  - [x] Escalation state storage (decision 6): a GitHub Actions cache keyed
        per ticket holds "highest level notified."
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

## MVP defects found 2026-08-20 — Fixed

- [x] Make an empty scan loud. Fixed 2026-08-26: `scanned: 0` in non-dry-run mode
      now throws `Error('Jira search returned 0 issues — check JIRA_JQL configuration')`.
- [x] Report overdue time in working hours. Fixed 2026-08-26: `overdueMinutes` now
      reads `elapsedTime` from JSM metric instead of clock time.

## Done — V2 implementation, 2026-09-07

`npm test` 93 passed, `npm run typecheck` exit 0, `npm run build` produced
`dist/server.mjs`. None of this is production evidence; see the blockers above.

- [x] Add the config file schema (person directory of Jira account -> Entra
      object id, plus a per-project L2-L5 mapping referencing it).
      `config/escalation.example.json` + `src/lib/escalation-config.ts`.
      Populating it with real ids is still open above.
- [x] Implement the escalation-state store. `src/lib/escalation-state.ts`, saved
      and restored by `actions/cache` in the reminder workflow.
- [x] Build the contact-directory resolver. Fails visibly on a missing contact
      and checks referential integrity at load time.
- [x] Implement the direct-message sender. `src/lib/teams-bot.ts`: token by
      client secret or GitHub OIDC, conversation create, activity post,
      `403 ForbiddenOperationException` and `403 MessageWritesBlocked` reported
      as distinct reasons.
      Escape target **not** parameterised: the sanitize/escape path is identical
      for both transports, so a parameter would have had one value. Revisit only
      if a real direct message shows a literal `&lt;` or `&amp;`.
- [x] Implement working-hours vs off-hours routing per `docs/sla-matrix.md`
      section 3. `src/lib/escalation.ts`, using JSM's `withinCalendarHours` so
      no calendar math is duplicated.
- [x] Add unit tests for every threshold in section 2, both routings. Elapsed
      working time is read from the JSM **resolution** metric.
- [x] Add workflow tests: no duplicate escalation across runs, dry-run sends
      zero direct messages and logs counts only.
- [x] Make the channel webhook optional so a bot-only deployment works. It was
      already removed from the workflow env while `src/lib/config.ts` still
      required it, which would have failed every non-dry run.

## Reference

- Contract SLA/escalation values: `docs/sla-matrix.md`
- Shipped MVP behavior and status: `docs/prd-priority-sla-reminders.md`,
  `docs/mvp-roadmap.md`
- V2 business case: `docs/brd-teams-bot-escalation.md`
- V2 product spec: `docs/prd-teams-bot-escalation.md`
