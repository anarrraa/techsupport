# PRD: client support report generator

Status: approved by the user 2026-11-05 (grilling session). Decisions log: `claude-notes.md`.

## Problem

Each month (or quarter) support staff hand-build a signed PDF "Дэмжлэг үйлчилгээний тайлан" per client and
system group from a Jira export, copying rows into extra sheets and computing counts, hours and penalties by hand.

## Scope

Upload a Jira export (xlsx or csv) on the dashboard, pick a client config, download one PDF per report group.
Nothing is stored (stateless). Persisting raw rows in Postgres `jsonb` is a later, separate step.

## Input

- Rows are read by header name. Unknown columns are ignored.
- Required (missing in the file → visible error): `Issue key`, `Summary`, `System`, `Priority`, `Request Type`,
  `Status`, `Created`, `Resolved at`.
- Optional, human-filled: `Хэтэрсэн хоног`, `Нийт`, `Давтан`, `Хүн цаг`, `Дараах төлбөрт цаг`, `Тайлбар`, `Хасах` (any text → row left out of every count; the text records why).
- Optional, Jira-computed: `Time to first response`, `Organizations`.

## Client config (local, gitignored — the repo is public)

Client name, scope text, report groups → systems (`*rest` = remaining), Request Type name → section mapping,
optional `hide` sections, daily penalty rate + contract № per system, optional first-response target,
optional `improvementHoursPerMonth`, signer and receiver.

## Period

Suggested from the file (latest `Created` month), editable (quarters allowed). Rows created in the period are
counted and split by month. Rows created before it and still open at its start go to a "previous period, still open"
section. Rows created after it are skipped.

## Report sections (one template, numbered automatically)

1. Overview: totals per month, by type, by system, by organization (bar charts).
2. Resolution: resolved %, list of open tickets.
3. Defects: resolved / open, by priority and system; first-response average when the column exists.
4. Repeated defects: grouped by `Давтан`. Empty column → "байхгүй"; absent column → "тэмдэглэгээ хийгдээгүй".
5. Improvements: hours = `Хүн цаг − Дараах төлбөрт цаг`; optional quota line.
6. Change requests / paid work: `Дараах төлбөрт цаг`.
7. Penalties: days from `Хэтэрсэн хоног`, `Нийт = days × rate`, a filled `Нийт` overrides; summary by priority,
   per-ticket table with `Тайлбар`; previous-period open defects included.
Then signatures and generation date. A section with no tickets prints one "бүртгэгдээгүй" line.

## Invariants

- No SLA or working-day math from timestamps; overdue days and first-response times come from the input.
- No ticket content is sent to an LLM; repeated-defect grouping is human-labelled.
- Output is PDF only (PDFKit, embedded Cyrillic TTF, hand-drawn bar charts).
- Test fixtures are synthetic; real client exports never enter the repo.

## Out of scope (v1)

Database persistence, section-level free notes, DOCX output, automatic hour-quota allocation, client access.
