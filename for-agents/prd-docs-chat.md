# PRD: Documentation chat (RAG)

Authorized by the user 2026-11-06. Progress lives in `roadmap.md`.

## Problem

Support staff answer questions about client systems (GS25, Shunkhlai, APU, ...)
by searching ~280 Markdown documents under `documents/<client>/<system>/` by hand.

## Solution

The existing `AdminChatPage` answers each question from those documents:
retrieve the closest chunks from Postgres + pgvector, then ask a Vertex AI
Gemini model to answer only from them and cite the source files.

## Requirements

1. Corpus is `documents/**/*.md` only. Jira data (tickets, summaries, assignees,
   SLA state) never enters the index or the prompt (AGENTS.md invariant).
2. `documents/` is client-confidential and gitignored; it is never committed.
3. Indexing is an explicit command (`npm run docs:index`), not a request-time
   side effect. Unchanged chunks (same content hash) are not re-embedded.
4. Chunks keep `client`, `system`, `path`, and heading so answers cite
   `documents/<client>/<system>/<file>.md › <heading>`.
5. The chat can be narrowed to one client; default is all clients.
6. The model answers only from retrieved chunks. No relevant chunk → it says it
   does not know (Mongolian or English, matching the UI locale). It never
   invents a source.
7. Bounded everywhere: question length, top-k, prompt size, Vertex timeout and
   retries, embedding batch size and concurrency.
8. Logs carry status, latency, and counts only, never question text, chunk text,
   or answers.
9. Credentials: `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`, ADC or a key
   file, the same variables the reminder intro already uses. Nothing in source.

## Decisions

- Vertex client: `@google/genai` (already in the dependency tree via Flue;
  promote to a direct dependency, same version).
- Embeddings: `gemini-embedding-001` (multilingual, needed for Mongolian) with
  `outputDimensionality: 768`, so pgvector's HNSW index applies.
- Answers: `gemini-2.5-flash`, the model the reminder intro uses.
- Storage: one `DocChunk` table in the existing Postgres; the embedding is a
  Prisma `Unsupported("vector(768)")` column read and written with raw SQL.
- Chunking: split on Markdown headings, then cap at ~1 500 characters with
  small overlap. Pure function, unit tested.

## Out of scope

Authentication (the backend binds to `127.0.0.1` by default), conversation
memory across questions, Jira-backed questions ("why was DC-844 skipped"),
re-ranking, and automatic re-indexing on file change.
