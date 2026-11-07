# TODO

Last updated: 2026-11-07

This tracks actionable next steps across the MVP and the proposed V2
(personal Teams bot + contract escalation). See `AGENTS.md` for required
reading order and non-negotiable invariants before touching any of this.

## Internal monthly reporting

- [x] Complete the internal observed-data report UI, UTC month selection,
      capture coverage, missing metrics, both SLA breach counts, and exports.
      Local pinned-toolchain, PostgreSQL, and API evidence is in `roadmap.md`.
- [ ] Verify actual browser layouts and keyboard flows.
- [ ] Provision production PostgreSQL, deploy local changes, and verify a real
      scheduled run writes the snapshots shown by the dashboard.

## Now — blocking, in order

- [x] Stop depending on GitHub's cron being punctual. Done 2026-09-09:
      `REMINDER_WINDOWS` moves the decision into the code, so a late run still
      delivers inside the window and a run delayed into the night delivers
      nothing. The cron sits at each window's start for the most room. No
      external scheduler — that would have been new infrastructure for a
      problem a clock check solves.
- [x] Record a fortnight of run times and missed windows. If the delay tail is
      worse than the 45-489 minutes measured, escalate to an external trigger
      calling `workflow_dispatch`. Recorded 2026-11-07 over 84 scheduled runs:
      delays 276-546 min, neither cron slot ever landed in its own window, 20 of
      42 weekdays had no in-window run. Tail is worse than 489 → next item.
      Roadmap evidence snapshot, [report](plan/phase-4-bot-production/reports/2026-11-07-evidence.md).
- [ ] Decide on an external trigger calling `workflow_dispatch` at 09:00 and
      14:00 Ulaanbaatar (user). Added 2026-11-07 from the measurement above.
- [ ] Push `a469bdb` (user). CI on `main` `a9cffcf` fails at `npm ci`; the
      reminder workflow runs the same step, so the Mon 2026-11-09 scheduled run
      fails until the lockfile fix is on `main`. Added 2026-11-07.
- [ ] Stop printing a staff email in every reminder run log (user, `.github/`
      change). The step's `env:` echo shows the `TEAMS_BOT_RECIPIENT_ALLOWLIST`
      repository variable; carry it as a secret or as object ids, then delete
      the old run logs (public repository). Found 2026-11-07.

- [x] Deploy. PR #2 and #3 merged 2026-09-08; escalation state seeded in the
      Actions cache (run `34203911077`, 0 messages sent); a dry-run on `main`
      confirms 2 recipients through the gate and 11 withheld, with no identity
      in the log. First scheduled run: Wed 2026-09-09 10:00 Ulaanbaatar.
- [ ] Rotate `TEAMS_BOT_APP_PASSWORD`. The value was pasted into a chat
      transcript while getting the transport working. Entra > SLA Reminder Bot >
      Certificates & secrets > new secret, then update `.env` and
      `gh secret set TEAMS_BOT_APP_PASSWORD`, then delete the old one.

- [ ] Check how Teams renders an escaped `>` in a bot message. `DC-863`'s summary
      contains `EZ Store > Орлого`, and the sanitiser turns that into `&gt;`,
      which is correct for the channel webhook but may show literally in a
      direct message. Look at that line in the next real delivery before
      deciding whether the bot needs its own escape target.
      Evidence 2026-11-07: 22 scheduled deliveries since; nobody has looked yet —
      a pilot recipient (user).

- [x] Configure the GitHub secrets and variables. Done 2026-09-08; the
      repository previously had none of either. Dispatch run `34185580185`
      proves Jira resolves in CI.

- [x] Set the schedule to the team's rhythm: twice a working day, 10:00 and
      15:00 Ulaanbaatar. Done 2026-09-08, with the delivery window opened to
      match so a sparse schedule cannot lock breaches out.
- [x] Fix the reminder schedule. Was `0 0 * * *`; a daily run made the delivery
      window permanently unreachable for three quarters of breaches, because
      1440 minutes is a whole multiple of the 60-minute repeat interval. Set to
      `*/15 * * * *` on 2026-09-08, which is what `README.md` always described.

- [x] Point `JIRA_JQL` at a service desk project that exists.
  - Done 2026-08-26: set to `project = DC AND statusCategory != Done AND assignee is not EMPTY`.
- [x] Give the Jira integration account **agent** access on the service desk
      projects in scope.
  - Done 2026-08-26: agent access granted on DC. `GET
    /rest/servicedeskapi/request/DC-844/sla` returns 200 OK.
- [x] Empty scan policy: user chose warning and successful zero-message exit on 2026-11-03; covered by workflow regression test.
- [x] Report overdue time in working hours. `overdueMinutes` now reads `elapsedTime`
      from JSM metric instead of clock time.
- [ ] Decide what `developer.privacyUrl` and `termsOfUseUrl` should point at.
      `https://zerotech.mn/privacy` and `/terms` both return 404, so on
      2026-09-08 both were pointed at `https://zerotech.mn`, which returns 200.
      A live link to the company site beats a dead link on the app's About page,
      but it is not a privacy policy — replace it if legal wants real pages.
- [ ] Swap the placeholder icons in `packages/teams-app/` for the real brand
      marks. `color.png` 192x192, `outline.png` 32x32 on a transparent
      background.
- [x] Record the bot's Entra application id. Done 2026-09-08: **SLA Reminder
      Bot**, `b76bcdfb-5a16-44c4-81e0-860780daa2da`. Now in the evidence
      table in `for-agents/roadmap.md` and in `.env.example`, so no future step
      starts with a hunt through the Azure portal.
- [ ] Get an administrator to publish the Teams app package to the
      organisation catalog. Build it with
      `npm run package:teams`. **No Teams app setup
      policy is needed** — superseded 2026-09-08 by the goOrange delivery path,
      which installs the app per recipient through Graph. See the revision note
      in `for-agents/roadmap.md`.
      Evidence 2026-11-07: install works, but the code also accepts a sideloaded
      entry and logs don't say which was used (Teams admin to confirm).
- [ ] Grant and consent the Graph **application** permissions on the app
      registration: `AppCatalog.Read.All`, and
      `TeamsAppInstallation.ReadWriteSelfForUser.All` (narrower — limited to this
      app; fall back to `TeamsAppInstallation.ReadWriteForUser.All` if Graph
      refuses). `User.Read.All` only if `npm run resolve:ids` is used rather than
      reading the two object ids from the portal. goOrange already holds this
      shape of permission in the tenant, so the pattern is approved.
      Evidence 2026-11-07: catalog read and installation proven by 22 delivering
      runs; `User.Read.All` unconfirmed (Entra admin).
- [ ] Configure a GitHub OIDC federated credential on the Entra app
      registration (decided 2026-08-24, matching the existing Vertex
      authentication pattern) instead of a client secret. Audience
      `api://AzureADTokenExchange`, subject
      `repo:<owner>/<repo>:ref:refs/heads/main`. The code path exists and is
      unit tested; only the credential is missing.
      Evidence 2026-11-07: still missing — every run uses the secret (Entra admin).
- [x] Fill in `config/escalation.json`: it already carries both pilot
      recipients' emails and real Jira account ids, so `npm run resolve:ids`
      fills the rest — or read the two object ids straight from the Azure portal.
      Then `gh secret set ESCALATION_DIRECTORY_JSON < config/escalation.json`.
      **Do not commit it.** This repository is public and the file names real
      people; it is gitignored for that reason.
      Done 2026-09-08 (roadmap "Recipient identifiers", secret set); every run
      since writes it. Checked 2026-11-07.
- [x] Prove the transport from this codebase. Done 2026-09-08:
      `Direct message delivered`. Recorded in the evidence snapshot.
- [x] Stage the first live run to two people only: set the
      `TEAMS_BOT_RECIPIENT_ALLOWLIST` repository variable to
      the two pilot recipients. Widen it once the messages read the
      way they should. Checked 2026-11-07: the variable holds two entries in
      every run since 2026-09-09 and 6-12 recipient legs are withheld per
      delivering run. Widening also unblocks "no level notified twice" (roadmap
      V2 milestone 2).
- [x] Seed the escalation state before the first live run
      (`ESCALATION_SEED_ONLY=true`, `REMINDER_DRY_RUN` unset). The 2026-09-07
      dry-run found 9 DC requests already past a level, two of them past L5.
      Without this the first live run delivers the whole backlog at once.
      Done 2026-09-08 by run `34203911077` (7 crossed, 0 messages), before the
      first live GitHub delivery `34329397461`. Checked 2026-11-07.
- [ ] Confirm with the client what Low L5 means. The contract gives it no clock
      mark ("only if SLA breached"), so Low currently never escalates past L4.
      Evidence 2026-11-07: still open — client.
- [x] Get the user's answers to the open decisions in
      `for-agents/brd-teams-bot-escalation.md`. All six resolved as of 2026-08-24:
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
- [x] Add a V2 milestone to `for-agents/roadmap.md` before writing any bot code
      (`AGENTS.md` scope guard). Added 2026-08-20 with the verified delivery
      evidence and the Azure prerequisites already established.

## Done — V2 delivery path prerequisites

Verified 2026-08-20. Details and evidence in `for-agents/roadmap.md`.

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
      `config/escalation.example.json` + `src/escalation/escalation-config.ts`.
      Populating it with real ids is still open above.
- [x] Implement the escalation-state store. `src/escalation/escalation-state.ts`, saved
      and restored by `actions/cache` in the reminder workflow.
- [x] Build the contact-directory resolver. Fails visibly on a missing contact
      and checks referential integrity at load time.
- [x] Implement the direct-message sender. `src/shared/teams-bot.ts`: token by
      client secret or GitHub OIDC, conversation create, activity post,
      `403 ForbiddenOperationException` and `403 MessageWritesBlocked` reported
      as distinct reasons.
      Escape target **not** parameterised: the sanitize/escape path is identical
      for both transports, so a parameter would have had one value. Revisit only
      if a real direct message shows a literal `&lt;` or `&amp;`.
- [x] Implement working-hours vs off-hours routing per `for-agents/sla-matrix.md`
      section 3. `src/escalation/escalation.ts`, using JSM's `withinCalendarHours` so
      no calendar math is duplicated.
- [x] Add unit tests for every threshold in section 2, both routings. Elapsed
      working time is read from the JSM **resolution** metric.
- [x] Add workflow tests: no duplicate escalation across runs, dry-run sends
      zero direct messages and logs counts only.
- [x] Make the channel webhook optional so a bot-only deployment works. It was
      already removed from the workflow env while `src/shared/config.ts` still
      required it, which would have failed every non-dry run.

## Reference

- Contract SLA/escalation values: `for-agents/sla-matrix.md`
- Shipped MVP behavior and status: `for-agents/prd-priority-sla-reminders.md`,
  `for-agents/roadmap.md`
- V2 business case: `for-agents/brd-teams-bot-escalation.md`
- V2 product spec: `for-agents/prd-teams-bot-escalation.md`
