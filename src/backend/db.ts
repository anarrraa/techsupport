import { PrismaPg } from '@prisma/adapter-pg';
import type { JiraTicket } from '../lib/jira.ts';
import { toSnapshotRows, type SnapshotRow } from '../lib/queries/monthly-report.ts';
import { PrismaClient } from './generated/prisma/client.ts';

let client: PrismaClient | undefined;

export function db(): PrismaClient {
	const connectionString = process.env.DATABASE_URL;
	if (!connectionString) throw new Error('DATABASE_URL is not set');
	// ponytail: one process-wide client; the reminder run and the API each need one connection pool.
	client ??= new PrismaClient({
		adapter: new PrismaPg({ connectionString, connectionTimeoutMillis: 5_000, max: 5 }),
	});
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
	return db().sLASnapshot.findMany({
		where: { capturedAt: { gte: start, lt: end } },
		omit: { id: true },
	});
}

export async function disconnect(): Promise<void> {
	await client?.$disconnect();
	client = undefined;
}
