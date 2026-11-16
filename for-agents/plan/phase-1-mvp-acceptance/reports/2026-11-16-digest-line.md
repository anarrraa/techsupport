# Deterministic digest line replaces PR #4

Date: 2026-11-16 · Agent: claude · Commit: the commit that adds this file

## Asked
Bring the latest `feat/ticket-digest` (PR #4) into `main`. The PR sent ticket
summaries and client comments to Gemini, which `AGENTS.md` forbids; the user
chose option A: keep the line, drop the model.

## Changed
- `src/shared/jira.ts`: search asks for `comment`; `JiraComment` keeps author
  name, `authorIsVendor` (`accountType 'atlassian'`) and time. Internal notes
  (`jsdPublic: false`), automation (`accountType 'app'`) and undated comments are
  skipped. The body is never kept.
- `src/reminder/reminder-message.ts`: `renderDigestLine` adds a `↳` line under
  each ticket: no comment yet / we answered N ago and wait for the client / the
  client wrote N ago and we owe the reply (plus who last answered for us). The
  line is dropped first when a ticket does not fit.
- `src/workflows/jira-teams-reminder.ts`: from `268c9bd`, one recipient's failed
  delivery no longer fails the run; every leg failing still throws, with reasons.
- Removed the unused `src/escalation/ticket-digest.ts` (model view and prompt).
  Docs: `architecture.md`, `data.md`, `env.md`, `gotchas.md`.
- Not ported from PR #4: model digest, Vertex auth in CI, `JIRA_COMMENT_*` and
  `REMINDER_*DIGEST*` env, directory spelling of names (Jira's display name is
  used), `trace-run` stage, and the wording commit `39a37fc` (its escalation
  header conflicts with the 2026-11-09 "N-р түвшний сануулга" decision).

## Verified
- `npm test`: 213 tests, 212 pass, 0 fail, 1 opt-in skip. New cases in existing
  files: comment parsing (`tests/shared/jira.test.ts`), the line's three forms and
  its drop order (`tests/reminder/reminder-message.test.ts`), partial vs total DM
  failure (`tests/workflows/jira-teams-reminder.test.ts`).
- `npm run typecheck`, `npm run build` exit 0.

## Not done / not verified
- No live run yet: the line has not been seen in a real Teams DM.
- `jsdPublic` on search-returned comments is assumed from the JSM comment shape;
  if absent, a comment counts as public.
