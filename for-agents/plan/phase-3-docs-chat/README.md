# Phase 3 — Documentation chat

Kind: code + user's GCP project. Roadmap: items 3.1-3.6. Requirements: `../../prd-docs-chat.md`.

Scope: pgvector `DocChunk` table (DB change, user approval), Markdown chunker,
Vertex embed/generate adapter, `npm run docs:index`, `POST /api/chat`,
`AdminChatPage` wiring.

Done when: the real `documents/` is indexed and known questions get correct,
cited answers. Reports never quote `documents/` text.
