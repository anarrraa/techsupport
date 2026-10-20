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
	const index = Number(match[2]) - 1;
	return { start: new Date(Date.UTC(year, index, 1)), end: new Date(Date.UTC(year, index + 1, 1)) };
}

interface BreachCounts {
	tickets: number;
	firstResponseBreached: number;
	resolutionBreached: number;
}

export interface MonthlyMetrics extends BreachCounts {
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
	const latest = new Map<string, SnapshotRow>();
	for (const row of rows) {
		const seen = latest.get(row.ticketKey);
		if (!seen || row.capturedAt > seen.capturedAt) latest.set(row.ticketKey, row);
	}

	const total: BreachCounts = { tickets: 0, firstResponseBreached: 0, resolutionBreached: 0 };
	const byPriority: Record<string, BreachCounts> = Object.create(null) as Record<string, BreachCounts>;
	for (const row of latest.values()) {
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
		...total,
		firstResponseBreachRate: rate(total.firstResponseBreached, total.tickets),
		resolutionBreachRate: rate(total.resolutionBreached, total.tickets),
		byPriority,
	};
}

function rate(count: number, of: number): number | null {
	return of === 0 ? null : count / of;
}
