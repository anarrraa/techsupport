# for-agents

Facts for a coding agent with no context. Every claim points at code or a command
that was run. Requirements, contract values and roadmap status stay in `docs/`;
this folder only says where things are and how not to break them.

| File | Read when |
| --- | --- |
| [architecture.md](architecture.md) | you need to find where something happens in a run |
| [commands.md](commands.md) | you need to run, test (one file too), build, trace or set up the bot |
| [conventions.md](conventions.md) | you are about to write code or a test |
| [gotchas.md](gotchas.md) | **before any change** — traps, open bugs, things that failed before |
| [data.md](data.md) | you touch Jira/JSM, Bot Connector, Graph, the escalation directory or state file |
| [env.md](env.md) | you add or read an env var, or a run fails on configuration |

Glossary: `CONTEXT.md` (root). Business terms are defined there; use its words,
avoid its *Avoid* words.

Last verified against code: 2026-10-13, branch `feat/ticket-digest` @ `39a37fc`.
