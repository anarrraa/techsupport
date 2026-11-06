import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.ts';
import type { JiraTicket } from '../shared/jira.ts';
import type { DocChunk } from '../docs-chat/chunk.ts';
import type { RetrievedChunk } from '../docs-chat/chat.ts';
import { toSnapshotRows, MAX_MONTHLY_SNAPSHOTS, MonthlyReportLimitError, type SnapshotRow } from '../monthly-report/monthly-report.ts';

let client: PrismaClient | undefined;

export function db() {
	if (!client) {
		const connectionString = process.env.DATABASE_URL;
		if (!connectionString) throw new Error('DATABASE_URL is required');
		client = new PrismaClient({ adapter: new PrismaPg({
			connectionString,
			connectionTimeoutMillis: 5000,
			query_timeout: 10000,
			statement_timeout: 10000,
			max: 4,
		}) });
	}
	return client;
}

/** One row per scanned ticket. Re-running the same instant is a no-op. */
export async function captureSnapshot(tickets: JiraTicket[], capturedAt: Date): Promise<number> {
	const { count } = await db().sLASnapshot.createMany({
		data: toSnapshotRows(tickets, capturedAt),
		skipDuplicates: true,
	});
	return count;
}

export async function monthSnapshots(start: Date, end: Date): Promise<SnapshotRow[]> {
	const rows = await db().sLASnapshot.findMany({
		where: { capturedAt: { gte: start, lt: end } },
		omit: { id: true },
		take: MAX_MONTHLY_SNAPSHOTS + 1,
	});
	if (rows.length > MAX_MONTHLY_SNAPSHOTS) throw new MonthlyReportLimitError();
	return rows;
}

export async function docChunkHashes(): Promise<string[]> {
	return (await db().docChunk.findMany({ select: { contentHash: true } })).map((row) => row.contentHash);
}

/** `embedding` is Unsupported in Prisma, so the row goes in as raw SQL. */
export async function insertDocChunk(chunk: DocChunk, embedding: number[]): Promise<void> {
	const { client: owner, system, path, heading, content, contentHash } = chunk;
	await db().$executeRaw`INSERT INTO "DocChunk" (client, system, path, heading, content, "contentHash", embedding, "updatedAt")
		VALUES (${owner}, ${system}, ${path}, ${heading}, ${content}, ${contentHash}, ${JSON.stringify(embedding)}::vector, now())
		ON CONFLICT ("contentHash") DO NOTHING`;
}

/**
 * Removes chunks whose file or text no longer exists, only for clients present on disk, so indexing
 * with one client's folder does not wipe the others. Returns the deleted count.
 */
export async function deleteDocChunksExcept(clients: string[], hashes: string[]): Promise<number> {
	return db().$executeRaw`DELETE FROM "DocChunk" WHERE client = ANY(${clients}::text[]) AND NOT ("contentHash" = ANY(${hashes}::text[]))`;
}

/** Nearest chunks by cosine distance. ponytail: sequential scan, add an HNSW index if latency matters. */
export async function searchDocChunks(vector: number[], client: string | undefined, limit: number): Promise<RetrievedChunk[]> {
	const v = JSON.stringify(vector);
	return client === undefined
		? db().$queryRaw`SELECT path, heading, content FROM "DocChunk" WHERE embedding IS NOT NULL ORDER BY embedding <=> ${v}::vector LIMIT ${limit}`
		: db().$queryRaw`SELECT path, heading, content FROM "DocChunk" WHERE embedding IS NOT NULL AND client = ${client} ORDER BY embedding <=> ${v}::vector LIMIT ${limit}`;
}

export async function docClients(): Promise<string[]> {
	const rows = await db().docChunk.findMany({ distinct: ['client'], select: { client: true }, orderBy: { client: 'asc' } });
	return rows.map((row) => row.client);
}

export async function disconnect(): Promise<void> {
	await client?.$disconnect();
	client = undefined;
}
