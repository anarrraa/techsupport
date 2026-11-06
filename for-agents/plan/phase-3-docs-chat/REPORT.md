# Phase 3 — Documentation chat: report

Closed 2026-11-06 · Agent: claude · Branch `orch/p3-docs-chat`

## Delivered
- pgvector `DocChunk` table (`prisma/schema.prisma`, `postgresqlExtensions` preview) — [3.1](reports/2026-11-06-3.1.md)
- Pure heading-scoped Markdown chunker, 1500/150 — [3.2](reports/2026-11-06-3.2.md)
- Vertex adapter (`gemini-embedding-001` 768-d, `gemini-2.5-flash`, bounded) and `npm run docs:index` with content-hash skip and stale-row delete — [3.3](reports/2026-11-06-3.3.md)
- `POST /api/chat`, `GET /api/chat/clients`, grounded prompt, zero-row "don't know" without a model call, privacy-safe logs — [3.4](reports/2026-11-06-3.4.md)
- `AdminChatPage` wired: answer + numbered sources + client picker, mn/en — [3.5](reports/2026-11-06-3.5.md)
- Live check against the real corpus and the user's GCP project: 279 files → 2762 chunks; re-run embeds 0; 6 of 7 questions correct with correct citations — [3.6](reports/2026-11-06-3.6.md)

Tests: root 172 → 190 after review fixes (189 pass, 1 skipped DB check); frontend 12 → 14.

## Left open
- Cross-lingual retrieval miss (Mongolian question, English-only page). See 3.6. Not fixed by decision.
- No HNSW index (`ponytail:` in schema and `db.ts`); fine at ~3k chunks.
- Shared/production database not migrated: needs a pgvector-enabled Postgres (phase 5 host choice) and `npm run docs:index` there.
- A client folder removed from disk keeps its index rows (deletes are scoped to clients on disk); delete by hand.

## Review fixes (2026-11-06)

Review `CHANGES-REQUESTED` (2 medium, 8 low, 3 nit), all addressed in commit "Address phase 3 review":

- Reports: 3.6 table now shows `client/system` + "expected doc cited" only; no client file names or headings in reports or the roadmap; the GCP project id is replaced by "user's GCP project (gcloud default)".
- Prompt: rules moved to the Vertex `systemInstruction` (`answer(system, user)`); excerpts wrapped as `<excerpt id source>`, the question as `<question>`; `<excerpt`/`<question` (open or close) in chunk text, source or question are escaped. Unit test `tests/docs-chat/chat.test.ts`.
- A "don't know" answer (model or zero rows) returns `sources: []`; `[n]` citations outside 1..N are removed.
- `.gitignore` `documents/` → `/documents` (also matches a symlink); verified with `git check-ignore -v documents` after removing the local exclude.
- Vertex timeout 30 s → 20 s per call (all attempts), so embed + answer stays under the frontend's 60 s.
- Index deletes are scoped to clients present on disk (live: a stale row of an on-disk client deleted, an off-disk client's row kept).
- `/api/chat` body-parser errors: "Invalid request body" / "Request body too large".
- UI: question input `maxLength` 1000; 4xx error messages are shown, 5xx stay generic.
- `finishReason`: `MAX_TOKENS` → answer marked "(answer truncated)"; any other non-`STOP` → empty → "don't know".
- Chunker: fences track their marker (```` ``` ```` or `~~~`); a line that opens and closes inline is not a fence. Two tests.
- `chunkIndex` column dropped (unused, went stale).
- Frontend `ChatMessage.sources` uses `ChatAnswer["sources"]` via `import type` from the backend.
- Roadmap evidence dates refreshed.

Verified: root `npm test` 190 tests, 189 pass / 0 fail / 1 skipped; `typecheck` 0; `build` 0. Frontend `npm test` 14 pass; `typecheck` 0; `build` 0.
Live re-check (throwaway pgvector, user's GCP project (gcloud default), `us-central1`): `db push` without `chunkIndex`; index `new 2762` (293 s) then `new 0` (0.8 s); scoped delete `deleted 1` with the off-disk client's row kept; 3 questions — GS25 flag (`gs25/lms`, cited, correct, 4.0 s), Shunkhlai settlement in Mongolian (`shunkhlai/pgw`, cited, correct, 2.5 s), no-answer question → exact "don't know" with `sources: []` (3.1 s). Log lines counts-only. Container and copied `.env` removed.
