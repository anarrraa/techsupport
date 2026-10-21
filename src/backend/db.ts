import { createRequire } from 'module';
import type { JiraTicket } from '../lib/jira.ts';
import { toSnapshotRows, type SnapshotRow } from '../lib/queries/monthly-report.ts';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

let client: any | undefined;

export function db() {
	client ??= new PrismaClient();
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
