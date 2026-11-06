# Phase plan

The phase table, end state, and checkbox status live in
`../roadmap.md` → "End state and phases". This folder holds each phase's scope
and the reports agents write when they finish work. Do not copy checklists here;
link to the roadmap items instead.

| Folder | Phase |
| --- | --- |
| [phase-0-clean-slate](phase-0-clean-slate/) | Commit current work, rotate leaked secret, tidy root |
| [phase-1-mvp-acceptance](phase-1-mvp-acceptance/) | MVP production acceptance |
| [phase-2-restructure](phase-2-restructure/) | Feature folders, shared types |
| [phase-3-docs-chat](phase-3-docs-chat/) | pgvector RAG chat over `documents/` |
| [phase-4-bot-production](phase-4-bot-production/) | Personal bot + escalation in production |
| [phase-5-hosting-auth](phase-5-hosting-auth/) | Hosting and Entra login |
| [phase-6-reporting-acceptance](phase-6-reporting-acceptance/) | Staff sign-off on dashboard and reports |

## Reports (required)

Every agent that finishes a roadmap item writes one report before handing back:

- Path: `phase-<n>-<name>/reports/<YYYY-MM-DD>-<item>.md`, e.g.
  `phase-2-restructure/reports/2026-11-07-2.1.md`. One file per item, so
  parallel agents never edit the same file. A second attempt on the same day
  adds a suffix (`-b`).
- When a phase's last item is checked, the agent closing it also writes
  `phase-<n>-<name>/REPORT.md`: what the phase delivered, links to the item
  reports, and anything left open.
- Also check the roadmap item and link the report from it, in the same change.
- No secrets, webhook URLs, ticket content, names, emails, object ids, or
  `documents/` text in reports. Aggregate counts only.

Template:

```markdown
# <item> <title>

Date: YYYY-MM-DD · Agent: <claude|codex|...> · Commit: <sha or "uncommitted">

## Asked
One or two lines: the roadmap item and any user instruction.

## Changed
- `path` — what and why (one line each)

## Verified
- `npm test` → N pass / N fail / N skipped
- `npm run typecheck` → exit 0
- `npm run build` → exit 0
- External checks: command, result, link

## Not done / not verified
Say what and why. "None" only if true.

## Next
The next item, or the blocker and who it waits on.
```
