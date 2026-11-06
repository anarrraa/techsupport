@../AGENTS.md

## Working with the user

- **No questions during work**: Don't ask via AskUserQuestion. Write decisions/notes to this file instead.
- **Write decisions here**: If a choice needs to be made, save it to for-agents/claude-notes.md (this file) so it's in context.
- **Parallel workers preferred**: Use orchestration (orch spawn) for multi-part tasks.
- **Tech stack choices**:
  - PDF export: PDFKit (lightweight, no browser needed - Puppeteer was too slow)
  - Excel export: exceljs (lightweight, for data export)
  - Dashboard: React + shadcn/ui with Recharts for charts
- **Reports format**: Match the samples provided (Excel + PDF with metrics, priority breakdown, charts)

## Phase 3 Implementation: PDF/Excel Exports + ReportsPage + Spreadsheet View

**Status**: COMPLETE ✓

**Backend (export.ts)**:
- `generatePDF(report)`: Creates PDF with summary metrics, priority breakdown, timestamp
- `generateExcel(report)`: Creates Excel workbook with 2 sheets (Summary + Priority Breakdown)
- Routes: `/api/reports/:month/export?format=pdf|excel` with proper Content-Type + filename headers

**Frontend (ReportsPage.tsx)**:
- ReportsPage component: Shows archive of last 12 months
- Download buttons: PDF and Excel for each month
- api-client functions: `downloadPDF()` and `downloadExcel()` handle file download

**Frontend (DashboardPage + ReportSpreadsheet)**:
- ReportSpreadsheet: Table-based view of report data on dashboard
- Shows summary metrics and priority breakdown
- Clean Tailwind styling with hover effects
- View-only table (foundation for future interactive spreadsheet editor)

**Verified**:
- PDF exports: Valid PDF files generated (1.8KB sample)
- Excel exports: Valid XLSX files generated (7.5KB sample)
- Spreadsheet display: Report data renders as table on dashboard
- All 141 tests pass
- Typecheck: All TS types correct

## Support report generator (xlsx/csv → per-system PDF) — decisions (2026-11-05)

- Goal: input a Jira export like `9 сарын тайлан DC.xlsx` (or CSV), output PDFs like the Shunkhlai / "Бусад систем" support reports.
- Step 1 (C): stateless — file in, PDF out. No database.
- Step 2 (A, later): persist raw rows schemaless in Postgres `jsonb` via existing Prisma (not MongoDB — no second DB).
- Columns are read by header name; unknown columns ignored; missing required columns
  (`Issue key`, `Summary`, `System`, `Priority`, `Request Type`, `Status`, `Created`, `Resolved at`) fail visibly.
- Report grouping: one local config per client (gitignored), listing report groups → systems (`*rest` = remaining),
  plus header fields (client, scope, contract №, signer/receiver). Signer phone numbers stay out of git.
- Penalty (алданги): overdue days from input column `Хэтэрсэн хоног` (never computed from timestamps — Jira owns SLA);
  daily rate per system (+ contract №) from config; `Нийт = days × rate`; a filled `Нийт` input cell overrides (negotiated amounts).
- Repeated defects: optional input column `Давтан` = human-written group label. Column present but empty → "Давтан гарсан доголдол байхгүй";
  column absent → "тэмдэглэгээ хийгдээгүй" (never falsely claim none). No LLM / fuzzy grouping (Jira content must not reach an LLM).
- Sections: one fixed template (union of both samples), each section filtered by `Request Type`; empty section → one line
  "... бүртгэгдээгүй". Per-client config maps that client's Request Type names → sections, optional `"hide": [...]`.
- Shape: `readRows(file)` (exceljs reads xlsx + csv) → `buildSupportReport(rows, config, period)` in `src/support-report/support-report.ts`
  (pure, TDD surface, synthetic fixtures only — repo is public) → `renderSupportReportPdf(report)` in `src/support-report/pdf.ts`. CLI entry via npm script.
- PDF needs an embedded Cyrillic TTF (Helvetica has no Cyrillic). Charts: hand-drawn PDFKit bar charts only (pies become bars), no chart lib.
- No CLI. Dashboard `ReportsPage` gets a "generate report" upload: drop file, pick client config, download one PDF per group.
  Upload endpoint parses in memory and stores nothing. Period auto-suggested from the file (latest `Created` month), editable
  (quarters). Rows created before the period and still open at its start → "өмнөх үеийн хаагдаагүй" section; rows after → skipped.
- First response average: optional Jira SLA column (`Time to first response`, Jira-computed) → average over defects vs config target.
  Column absent → line omitted. Never derived from timestamps/comments. TODO: confirm the CSV export format of that column with a real sample.
- Hours: manual columns `Хүн цаг` (total) and `Дараах төлбөрт цаг`. Improvement section shows the difference, paid-work section shows
  `Дараах төлбөрт цаг`. Optional config `improvementHoursPerMonth` only adds a "X of N quota hours used" line; no auto-allocation.
- Free text: per-ticket `Тайлбар` column shown in open/penalty tables; section prose is template-generated. Output PDF only
  (regenerate from the edited Excel). Section-level free notes (upload form) deferred.
- Upload wiring (2026-11-06): done inline, not via `orch` workers — the support-report base files were uncommitted, so
  worktrees from `main` would not contain them, and committing was not allowed. `/period` also runs
  `buildSupportReport`'s input checks (zero groups) so a bad file fails at upload instead of silently leaving the
  period empty. Unknown (well-formed) config id → 404; malformed → 400.
  Review fixes (same day): input checks are `assertSupportRows` + `SupportInputError` in `support-report.ts`
  (only that class and read errors → 400; anything else → 500 "Internal error"). The form has one button per group
  (each download is its own click, so the browser doesn't block it) instead of one button looping over groups.
  Not done: validating query params before the 10 MB body is buffered (bounded, nit).

## Restructure + docs chat — decisions (2026-11-06)

- Feature folders, not DDD/Clean/monorepo tooling. Phases and status: `roadmap.md` → "Restructure + documentation chat".
- Docs chat corpus = `documents/**/*.md` (279 client system docs, ~3.8 MB). Gitignored — repo is public.
- Sending those docs to Vertex AI in the user's own GCP project is accepted by the user's request; Jira data never goes there.
- Gates still open: committing current work (Phase 0b) and enabling pgvector on the DB (Phase 4a) need explicit user OK.

## Browser acceptance (6.1) — decisions (2026-11-06)

- Closed mobile drawer uses `invisible` (keeps links out of Tab order) instead of `inert` (React 18 has no typed `inert` prop and
  `lg` must stay interactive). Slide-out animation is lost on close; slide-in stays.
- Support upload 4xx: frontend shows a localized lead (`support.invalid`) + the server detail unchanged (column names stay as in the export). 6.1 checked.
