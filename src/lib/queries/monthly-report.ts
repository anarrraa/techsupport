import type { JiraTicket } from '../jira.ts';

/**
 * One `SLASnapshot` row, minus its id. Mirrors `prisma/schema.prisma` so this
 * module stays free of the Prisma client and the unit suite stays fast.
 *
 * Only JSM's own figures and the ticket's key, priority and status: no summary,
 * comment, assignee or participant, so nothing client-authored is stored.
 */
export interface SnapshotRow {
	capturedAt: Date;
	ticketKey: string;
	priority: string;
	status: string;
	firstResponseState: string | null;
	firstResponseBreached: boolean | null;
	firstResponsePaused: boolean | null;
	firstResponseElapsed: number | null;
	firstResponseRemaining: number | null;
	resolutionState: string | null;
	resolutionBreached: boolean | null;
	resolutionPaused: boolean | null;
	resolutionElapsed: number | null;
	resolutionRemaining: number | null;
}

export function toSnapshotRows(tickets: JiraTicket[], capturedAt: Date): SnapshotRow[] {
	return tickets.map(({ key, priority, status, firstResponseSla: fr, resolutionSla: res }) => ({
		capturedAt,
		ticketKey: key,
		priority,
		status,
		firstResponseState: fr?.state ?? null,
		firstResponseBreached: fr?.breached ?? null,
		firstResponsePaused: fr?.paused ?? null,
		firstResponseElapsed: fr?.elapsedMinutes ?? null,
		firstResponseRemaining: fr?.remainingMinutes ?? null,
		resolutionState: res?.state ?? null,
		resolutionBreached: res?.breached ?? null,
		resolutionPaused: res?.paused ?? null,
		resolutionElapsed: res?.elapsedMinutes ?? null,
		resolutionRemaining: res?.remainingMinutes ?? null,
	}));
}

/** `YYYY-MM` to its UTC half-open range, or null when the month is malformed. */
export function monthRange(month: string): { start: Date; end: Date } | null {
	const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
	if (!match) return null;
	const year = Number(match[1]);
	if (year === 0) return null;
	const index = Number(match[2]) - 1;
	const start = new Date(0);
	start.setUTCFullYear(year, index, 1);
	const end = new Date(start);
	end.setUTCMonth(index + 1);
	return { start, end };
}

interface BreachCounts {
	tickets: number;
	firstResponseBreached: number;
	resolutionBreached: number;
}

export interface CaptureCoverage {
	firstCapturedAt: string | null;
	lastCapturedAt: string | null;
	capturedDays: number;
}

export const MAX_MONTHLY_SNAPSHOTS = 100_000;
export class MonthlyReportLimitError extends Error {
	constructor() { super('Monthly report exceeds snapshot limit'); this.name = 'MonthlyReportLimitError'; }
}

export interface MonthlyMetrics extends BreachCounts {
	coverage: CaptureCoverage;
	firstResponseKnown: number;
	firstResponseMissing: number;
	resolutionKnown: number;
	resolutionMissing: number;
	month: string;
	snapshots: number;
	firstResponseBreachRate: number | null;
	resolutionBreachRate: number | null;
	byPriority: Record<string, BreachCounts>;
}

/**
 * Each ticket counts once, as its latest snapshot in the month reported it.
 * Breach is JSM's flag on that snapshot; nothing here recomputes it.
 */
export function aggregateMonth(month: string, rows: SnapshotRow[]): MonthlyMetrics {
	const range = monthRange(month);
	if (!range) throw new Error('month must be YYYY-MM');
	rows = rows.filter(row => row.capturedAt >= range.start && row.capturedAt < range.end);
	if (rows.length > MAX_MONTHLY_SNAPSHOTS) throw new MonthlyReportLimitError();
	const latest = new Map<string, SnapshotRow>();
	let first: Date | null = null;
	let last: Date | null = null;
	const days = new Set<string>();
	for (const row of rows) {
		if (!first || row.capturedAt < first) first = row.capturedAt;
		if (!last || row.capturedAt > last) last = row.capturedAt;
		days.add(row.capturedAt.toISOString().slice(0, 10));
		const seen = latest.get(row.ticketKey);
		if (!seen || row.capturedAt > seen.capturedAt) latest.set(row.ticketKey, row);
	}

	const total: BreachCounts = { tickets: 0, firstResponseBreached: 0, resolutionBreached: 0 };
	const byPriority: Record<string, BreachCounts> = Object.create(null) as Record<string, BreachCounts>;
	let firstResponseKnown = 0;
	let resolutionKnown = 0;
	for (const row of latest.values()) {
		if (row.firstResponseBreached !== null) firstResponseKnown++;
		if (row.resolutionBreached !== null) resolutionKnown++;
		const bucket = (byPriority[row.priority] ??= {
			tickets: 0,
			firstResponseBreached: 0,
			resolutionBreached: 0,
		});
		for (const counts of [total, bucket]) {
			counts.tickets += 1;
			if (row.firstResponseBreached) counts.firstResponseBreached += 1;
			if (row.resolutionBreached) counts.resolutionBreached += 1;
		}
	}

	return {
		month,
		snapshots: rows.length,
		coverage: { firstCapturedAt: first?.toISOString() ?? null, lastCapturedAt: last?.toISOString() ?? null, capturedDays: days.size },
		firstResponseKnown,
		firstResponseMissing: latest.size - firstResponseKnown,
		resolutionKnown,
		resolutionMissing: latest.size - resolutionKnown,
		...total,
		firstResponseBreachRate: rate(total.firstResponseBreached, total.tickets),
		resolutionBreachRate: rate(total.resolutionBreached, total.tickets),
		byPriority,
	};
}

function rate(count: number, of: number): number | null {
	return of === 0 ? null : count / of;
}
