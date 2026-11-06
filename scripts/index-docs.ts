/**
 * npm run docs:index — embed documents/**\/*.md into DocChunk (for-agents/prd-docs-chat.md).
 * Unchanged chunks (same contentHash) are not re-embedded; chunks of removed or edited text are deleted
 * (only for clients that have a folder under documents/).
 * Prints counts only, never document text: documents/ is client-confidential.
 */
import { readdir, readFile } from 'node:fs/promises';
import { chunkDocument } from '../src/docs-chat/chunk.ts';
import { embed, EMBED_BATCH } from '../src/docs-chat/vertex.ts';
import { deleteDocChunksExcept, disconnect, docChunkHashes, insertDocChunk } from '../src/backend/db.ts';

const ROOT = 'documents';

try {
	const files = (await readdir(ROOT, { recursive: true })).filter((f) => f.endsWith('.md')).sort();
	// An empty or missing corpus would otherwise delete the whole index.
	if (!files.length) throw new Error(`No .md files under ${ROOT}/`);
	const chunks = [];
	for (const file of files) chunks.push(...chunkDocument({ path: `${ROOT}/${file}`, text: await readFile(`${ROOT}/${file}`, 'utf8') }));
	const known = new Set(await docChunkHashes());
	const fresh = chunks.filter((c) => !known.has(c.contentHash));
	// Batch by batch, so an interrupted run keeps what it already embedded.
	for (let i = 0; i < fresh.length; i += EMBED_BATCH) {
		const batch = fresh.slice(i, i + EMBED_BATCH);
		const vectors = await embed(batch.map((c) => `${c.heading}\n\n${c.content}`), 'document');
		for (const [j, chunk] of batch.entries()) await insertDocChunk(chunk, vectors[j]);
	}
	// Scoped to clients on disk: a removed client folder keeps its rows until deleted by hand.
	const clients = [...new Set(files.map((f) => f.split('/')[0]))];
	const deleted = await deleteDocChunksExcept(clients, chunks.map((c) => c.contentHash));
	console.log(`files ${files.length}, chunks ${chunks.length}, new ${fresh.length}, deleted ${deleted}`);
} finally {
	await disconnect();
}
