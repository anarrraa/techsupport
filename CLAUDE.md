@AGENTS.md

## Working with the user

- **No questions during work**: Don't ask via AskUserQuestion. Write decisions/notes to this file instead.
- **Write decisions here**: If a choice needs to be made, save it to CLAUDE.md (this file) so it's in context.
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
