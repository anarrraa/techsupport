import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.ts';
import type { JiraTicket } from '../lib/jira.ts';
import { toSnapshotRows, MAX_MONTHLY_SNAPSHOTS, MonthlyReportLimitError, type SnapshotRow } from '../lib/queries/monthly-report.ts';

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

export async function disconnect(): Promise<void> {
	await client?.$disconnect();
	client = undefined;
}
