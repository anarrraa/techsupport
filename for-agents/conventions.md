# Conventions

Patterns the code follows. Copy them.

## Layout

- `src/lib/` imports no framework (`@flue/runtime` only in `src/agents/`,
  `src/workflows/`). Prompt text lives in lib (`src/lib/ticket-digest.ts:197`),
  agents just bind it (`src/agents/digest-writer.ts:9`).
- Never put a test in `src/agents/` or `src/workflows/`: Flue requires every file
  there to default-export a definition, so the build breaks. Tests go in `tests/`
  mirroring `src/` (`tests/lib/sla.test.ts` ↔ `src/lib/sla.ts`).
- Relative imports end in `.ts` (`src/workflows/jira-teams-reminder.ts:3-43`).
- Tabs for indentation.

## Code

| Pattern | Example |
| --- | --- |
| I/O injected as params with real defaults, so tests pass fakes | `fetchTickets(config, fetchImpl = fetch, sleep?)` `src/lib/jira.ts:97-101` |
| Workflow side effects swappable via `dependencies` | `src/workflows/jira-teams-reminder.ts:72-101,137` |
| Every env var parsed once in `config.ts`, integers bounded min/max | `integer(env, 'JIRA_PAGE_SIZE', 50, 1, 100)` `src/lib/config.ts:176` |
| Files from disk validated with valibot | `src/lib/escalation-config.ts:19-51`, `src/lib/escalation-state.ts:20` |
| Misconfiguration throws with the env var name in the message | `src/workflows/jira-teams-reminder.ts:169-173,290-295` |
| Optional model work never throws; returns a result + reason | `DigestReason` `src/lib/ticket-digest.ts:26`, `IntroReason` `src/lib/reminder-intro.ts:21` |
| CI log = run journal, typed so names/titles can't be passed | `src/lib/run-journal.ts:18-76` |
| Untrusted text (Jira fields, model output) cleaned + escaped before render | `cleanField` / `escapeMarkdown` / `escapeHtml` `src/lib/reminder-message.ts:251-273` |
| Deliberate shortcut marked `ponytail:` with its ceiling | `src/lib/escalation-state.ts:15` |
| Comments explain *why* (often citing a past failure or `AGENTS.md`), not what | `src/workflows/jira-teams-reminder.ts:378-381` |

## Tests

- One behavior per `test(...)`, sentence-style names
  (`"the dry-run digest journal reports counts and no request content"`).
- Workflow tests call `runJiraTeamsReminder` with fake `dependencies` and a fixed
  `now` (`tests/workflows/jira-teams-reminder.test.ts:14`).
- Privacy guarantees get their own test (journal output has no ticket content).

## Commits / docs

- Commit subject: plain English sentence stating the behavior, no prefix
  (`git log`: "One recipient's failure must not silence everyone else's reminder").
- Roadmap work updates `docs/mvp-roadmap.md` in the same change (`AGENTS.md`).
- Use `CONTEXT.md` vocabulary in names and messages.
