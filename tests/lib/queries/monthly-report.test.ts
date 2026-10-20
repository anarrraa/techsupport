import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { JiraTicket, SlaCycle } from '../../../src/lib/jira.ts';
import {
	aggregateMonth,
	monthRange,
	toSnapshotRows,
	type SnapshotRow,
} from '../../../src/lib/queries/monthly-report.ts';

const AT = new Date('2026-10-01T02:00:00Z');

test('a snapshot keeps JSM figures and drops every free-text and personal field', () => {
	const [row] = toSnapshotRows([ticket()], AT);
	assert.deepEqual(row, {
		capturedAt: AT,
		ticketKey: 'SYNTHETIC-1',
		priority: 'High',
		status: 'Waiting',
		firstResponseState: 'ongoing',
		firstResponseBreached: true,
		firstResponsePaused: false,
		firstResponseElapsed: 45,
		firstResponseRemaining: -15,
		resolutionState: null,
		resolutionBreached: null,
		resolutionPaused: null,
		resolutionElapsed: null,
		resolutionRemaining: null,
	});
	assert.doesNotMatch(JSON.stringify(row), /Synthetic (summary|Developer)|comment/);
});

test('months parse to UTC half-open ranges and reject anything else', () => {
	assert.deepEqual(monthRange('2026-12'), {
		start: new Date('2026-12-01T00:00:00Z'),
		end: new Date('2027-01-01T00:00:00Z'),
	});
	for (const bad of ['2026-13', '2026-1', '202610', '2026-10-01', '']) {
		assert.equal(monthRange(bad), null, bad);
	}
});

test('each ticket counts once, as its latest snapshot reported it', () => {
	const rows: SnapshotRow[] = [
		row('A-1', 'High', '2026-10-01T02:00:00Z', false, false),
		row('A-1', 'High', '2026-10-02T02:00:00Z', true, false), // later: breached
		row('A-2', 'Low', '2026-10-01T02:00:00Z', true, true),
		row('A-3', 'Low', '2026-10-03T02:00:00Z', false, null),
	];
	assert.deepEqual(aggregateMonth('2026-10', rows), {
		month: '2026-10',
		snapshots: 4,
		tickets: 3,
		firstResponseBreached: 2,
		resolutionBreached: 1,
		firstResponseBreachRate: 2 / 3,
		resolutionBreachRate: 1 / 3,
		byPriority: Object.assign(Object.create(null), {
			High: { tickets: 1, firstResponseBreached: 1, resolutionBreached: 0 },
			Low: { tickets: 2, firstResponseBreached: 1, resolutionBreached: 1 },
		}),
	});
});

test('an empty month reports no rate rather than zero', () => {
	const metrics = aggregateMonth('2026-10', []);
	assert.equal(metrics.tickets, 0);
	assert.equal(metrics.firstResponseBreachRate, null);
});

function row(
	key: string,
	priority: string,
	at: string,
	firstResponseBreached: boolean,
	resolutionBreached: boolean | null,
): SnapshotRow {
	return {
		...toSnapshotRows([ticket({ key, priority, resolutionSla: null })], new Date(at))[0]!,
		firstResponseBreached,
		resolutionBreached,
	};
}

function ticket(overrides: Partial<JiraTicket> = {}): JiraTicket {
	const firstResponseSla: SlaCycle = {
		name: 'First response',
		state: 'ongoing',
		breached: true,
		paused: false,
		withinCalendarHours: true,
		breachTimeEpochMillis: AT.getTime() - 15 * 60_000,
		elapsedMinutes: 45,
		remainingMinutes: -15,
	};
	return {
		key: 'SYNTHETIC-1',
		summary: 'Synthetic summary',
		status: 'Waiting',
		priority: 'High',
		assignee: 'Synthetic Developer',
		assigneeAccountId: 'synthetic-account',
		participants: [{ accountId: 'synthetic-account', displayName: 'Synthetic Developer' }],
		comments: [{ authorAccountId: null, authorDisplayName: 'x', createdEpochMillis: 0, body: 'comment' }],
		url: 'https://jira.invalid/browse/SYNTHETIC-1',
		firstResponseSla,
		resolutionSla: null,
		...overrides,
	};
}
