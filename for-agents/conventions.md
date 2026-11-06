# Conventions

Patterns the code follows. Copy them.

## Layout

- Feature folders import no framework (`@flue/runtime` only in `src/agents/`,
  `src/workflows/`; adapters listed in `AGENTS.md`). Prompt text lives in the feature folder (`REMINDER_INTRO_INSTRUCTIONS` in
  `src/reminder/reminder-intro.ts`), agents just bind it (`src/agents/reminder-writer.ts`).
- Never put a test in `src/agents/` or `src/workflows/`: Flue requires every file
  there to default-export a definition, so the build breaks. Tests go in `tests/`
  mirroring `src/` (`tests/reminder/sla.test.ts` ↔ `src/reminder/sla.ts`).
- Relative imports end in `.ts` (`src/workflows/jira-teams-reminder.ts`).
- Tabs for indentation.

## Code

| Pattern | Example |
| --- | --- |
| I/O injected as params with real defaults, so tests pass fakes | `fetchTickets(config, fetchImpl = fetch, sleep?)` `src/shared/jira.ts` |
| Workflow side effects swappable via `dependencies` | `src/workflows/jira-teams-reminder.ts` |
| Every env var parsed once in `config.ts`, integers bounded min/max | `integer(env, 'JIRA_PAGE_SIZE', 50, 1, 100)` `src/shared/config.ts` |
| Files from disk validated with valibot | `src/escalation/escalation-config.ts`, `src/escalation/escalation-state.ts` |
| Misconfiguration throws with the env var name in the message | `src/workflows/jira-teams-reminder.ts` |
| Optional model work never throws; returns a result + reason | `DigestReason` `src/escalation/ticket-digest.ts`, `IntroReason` `src/reminder/reminder-intro.ts` |
| CI log = run journal, typed so names/titles can't be passed | `src/reminder/run-journal.ts` |
| Untrusted text (Jira fields, model output) cleaned + escaped before render | `cleanField` / `escapeMarkdown` / `escapeHtml` `src/reminder/reminder-message.ts` |
| Deliberate shortcut marked `ponytail:` with its ceiling | `src/escalation/escalation-state.ts` |
| Comments explain *why* (often citing a past failure or `AGENTS.md`), not what | `src/workflows/jira-teams-reminder.ts` |

## Tests

- One behavior per `test(...)`, sentence-style names
  (`"the dry-run digest journal reports counts and no request content"`).
- Workflow tests call `runJiraTeamsReminder` with fake `dependencies` and a fixed
  `now` (`tests/workflows/jira-teams-reminder.test.ts`).
- Privacy guarantees get their own test (journal output has no ticket content).

## Commits / docs

- Commit subject: plain English sentence stating the behavior, no prefix
  (`git log`: "One recipient's failure must not silence everyone else's reminder").
- Roadmap work updates `for-agents/roadmap.md` in the same change (`AGENTS.md`).
- Use `for-agents/CONTEXT.md` vocabulary in names and messages.
