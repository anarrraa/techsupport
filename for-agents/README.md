# for-agents

Central context for agents working on this repository. Root `AGENTS.md` defines
mandatory rules and reading order; this folder holds the project knowledge it
references. Paths written as `for-agents/...` are relative to the repository root.
Markdown links in this index are relative to this folder.

Requirements define behavior, `sla-matrix.md` defines contractual values, and
`roadmap.md` defines release evidence and priority. Keep one authoritative copy
of each. Existing reference notes retain their historical verification dates;
consult the roadmap and code for current status.

## Requirements, status, and tasks

| File | Purpose |
| --- | --- |
| [roadmap.md](roadmap.md) | Current milestones, blockers, execution order, evidence, and definition of done |
| [TODO.md](TODO.md) | Actionable task list |
| [prd-priority-sla-reminders.md](prd-priority-sla-reminders.md) | MVP behavior |
| [sla-matrix.md](sla-matrix.md) | Contractual SLA and escalation values |
| [brd-teams-bot-escalation.md](brd-teams-bot-escalation.md) | Bot business decisions |
| [prd-teams-bot-escalation.md](prd-teams-bot-escalation.md) | Bot and escalation requirements |
| [prd-monthly-dashboard.md](prd-monthly-dashboard.md) | Approved monthly snapshot/report scope |
| [prd-docs-chat.md](prd-docs-chat.md) | Documentation chat (pgvector RAG, Vertex) |
| [prd-hosting-auth.md](prd-hosting-auth.md) | Cloud Run hosting and Entra staff login |
| [plan/](plan/README.md) | Per-phase scope and agent completion reports |
| [CONTEXT.md](CONTEXT.md) | Project vocabulary |

## Working references

| File | Read when |
| --- | --- |
| [architecture.md](architecture.md) | you need to find where something happens in a run |
| [commands.md](commands.md) | you need to run, test (one file too), build, trace or set up the bot |
| [conventions.md](conventions.md) | you are about to write code or a test |
| [gotchas.md](gotchas.md) | **before any change** — traps, open bugs, things that failed before |
| [data.md](data.md) | you touch Jira/JSM, Bot Connector, Graph, the escalation directory or state file |
| [env.md](env.md) | you add or read an env var, or a run fails on configuration |

Glossary: [CONTEXT.md](CONTEXT.md). Business terms are defined there; use its words,
avoid its *Avoid* words.

Last verified against code: 2026-10-13, branch `feat/ticket-digest` @ `39a37fc`.

## Dashboard and implementation references

- [Dashboard/admin chat PRD](prd-dashboard-admin-chat.md)
- [V2 dashboard/admin chat PRD](prd-v2-dashboard-admin-chat.md)
- [Implementation stack](implementation-stack.md)
- [Frontend setup](FRONTEND-SETUP.md) and [backend setup](BACKEND-SETUP.md)
- [Dashboard design system](design-system-dashboard.md)
- [Dashboard mockup](dashboard-mockup.html)
- Figma prompts: [dashboard](figma-prompts-dashboard.md),
  [monthly report](figma-prompts-monthly-report-dashboard.md),
  [admin chat](figma-prompts-admin-chat.md)
- [ADR 0001: reminder intro sandbox tools](adr/0001-reminder-intro-sandbox-tools.md)
- [Claude working notes](claude-notes.md)

Historical proposals and setup notes do not override the approved PRDs, contract,
or current roadmap. Read the relevant scope before applying their examples.

UI skill discovery context: [PRODUCT.md](../PRODUCT.md) (root discovery file; detailed requirements remain in this folder).

API contract: [monthly-report-api.md](monthly-report-api.md), with [Postman smoke checks](api/monthly-report.postman_collection.json).
