# Gotchas

Read before changing anything. Hard invariants are in `AGENTS.md`; this file is
the traps around them.

## Open issues found in code (2026-10-13, not fixed)

- **No LLM digest path.** `src/escalation/ticket-digest.ts` is imported nowhere
  (no workflow call, no test); its header names `src/agents/digest-writer.ts`,
  which does not exist. Deleting it needs user OK (phase 2 REPORT, "Left open").
- **ADR 0001 precondition is now triggered.** `for-agents/adr/0001-reminder-intro-sandbox-tools.md`
  says: the first time request-derived text reaches a model, the default sandbox
  (shell + unrestricted network) must be narrowed *before* that ships. The digest
  sends summaries and client comments. Do not enable `REMINDER_USE_LLM_DIGEST`
  until this is resolved.
- `for-agents/CONTEXT.md` lists "digest" as an *Avoid* word for **Reminder**; the new module
  uses "Ticket Digest" for a different thing (per-request line). Don't rename
  either without updating `for-agents/CONTEXT.md`.

## SLA / time

- Never compute SLA age from timestamps. Two different JSM figures, two functions:
  `overdueMinutes` = `-remainingTime` (time past target, `src/reminder/sla.ts`);
  `elapsedSinceRaisedMinutes` = `elapsedTime` (from raised, for escalation
  marks). They were once one field read two ways — that was a bug.
- `REMINDER_DELIVERY_WINDOW_MINUTES` must equal `REMINDER_REPEAT_MINUTES` on the
  twice-a-day schedule. A smaller window permanently hides the same subset of
  breaches when run gaps are multiples of the repeat (`src/shared/config.ts`).
- GitHub cron starts 45–489 min late and sometimes never. `REMINDER_WINDOWS`
  (default `09:00-12:00,14:00-18:00` Asia/Ulaanbaatar) is what actually gates
  delivery (`src/workflows/jira-teams-reminder.ts`). Don't "fix" timing
  in cron.
- Low priority never reaches L5: `LEVEL_MINUTES.low[5] = null` pending client
  answer (`src/escalation/escalation.ts`). Don't invent a threshold.
- Escalation steps one level per run (`nextLevel`, `src/escalation/escalation.ts`),
  never jumps to the highest crossed mark; seeding is the opposite — it records
  the highest (`src/workflows/jira-teams-reminder.ts`).

## Delivery

- A *leg* = one recipient's DMs for a candidate; off-hours Critical/High sends
  one level to L1 + L2, i.e. several legs. A level counts as notified only if
  **every** leg carrying it succeeded (`src/workflows/jira-teams-reminder.ts`).
  State is one level per ticket, so after a partial failure the next run re-sends
  to **all** legs of that level — the ones that succeeded get a duplicate. This is
  deliberate: duplicate over gap.
- Some recipients fail → run exits 0, failures counted in the journal. All
  recipients fail → run throws.
- State is saved in `finally` and the cache save step is `if: always()`, so a
  failed run still keeps what was delivered (`.github/workflows/jira-teams-reminder.yml`).
- Cache key is per run id with prefix restore; a miss
  re-notifies rather than skipping — duplicate, never a gap.
- `TEAMS_BOT_RECIPIENT_ALLOWLIST`: an entry matching nobody is an error; withheld
  levels are not recorded as notified.
- Teams rejects email/UPN for proactive DMs — every recipient needs an Entra
  object id. The example file's nil UUID is rejected on purpose
  (`src/escalation/escalation-config.ts`).
- The sanitizer turns `>` into `&gt;`; correct for the webhook, possibly shown
  literally in a bot DM (open item in `for-agents/TODO.md`).

## Identity / privacy

- Participants are filtered to `accountType: 'atlassian'` at the Jira boundary
  (`src/shared/jira.ts`) so clients are never told they owe a reply. Comment
  authors are **not** filtered — the digest needs client comments.
- Who "owns" a request comes from directory `jiraAccountId`, never a model.
- The run journal goes to public CI logs: counts only. `npm run trace` prints
  names and must never be wired into the workflow (`scripts/trace-run.ts`).
- This repo is **public**. `config/escalation.json`, `.env*`, `gcp-sa.json`,
  `.escalation-state/` are gitignored (`.gitignore`). Don't read `.env` or
  `gcp-sa.json`.

## Fail-visibly checks (don't remove)

- Empty scans warn and succeed without sends (user decision 2026-11-03); Jira request failures and missing configured metrics on non-empty scans still fail visibly.
- Resolution SLA missing on all tickets throws; no vendor participant on
  all tickets throws.
- `ESCALATION_SEED_ONLY` + dry-run throws.
- No transport configured outside dry-run throws (`src/shared/config.ts`).

## Tooling

- Toolchain pinned to Node 22.19.0 / npm 10.9.3 (`.node-version`,
  `package.json packageManager`). `scripts/verify-toolchain.mjs` exits 1 on any
  other version (it did locally on Node 26); CI runs it first.
- Flue is `1.0.0-beta`; its bundled docs disagree with shipped code (ADR 0001).
  Check `node_modules/@flue/*` source, not docs.
- `JIRA_COMMENT_CHARS` (default 600, `src/shared/config.ts`) caps at the Jira
  boundary, then the digest clips again to 400 (`DIGEST_COMMENT_CHARS`,
  `src/escalation/ticket-digest.ts`). Raising the env var alone won't give the model more.
