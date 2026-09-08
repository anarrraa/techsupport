import assert from 'node:assert/strict';
import test from 'node:test';
import {
	dueLevel,
	firstResponseMinutes,
	planEscalation,
	selectEscalations,
	severityFor,
	type ContactLevel,
	type Severity,
} from '../../src/lib/escalation.ts';
import type { JiraTicket, SlaCycle } from '../../src/lib/jira.ts';

/**
 * Every number asserted here is copied from `docs/sla-matrix.md`. The contract
 * states each level as "+Xh after the previous level's mark"; the module stores
 * the running totals, so the sums are restated independently below.
 */
const CONTRACT: Record<Severity, { firstResponse: number; marks: Record<ContactLevel, number | null> }> = {
	critical: { firstResponse: 30, marks: { 2: 4 * 60, 3: (4 + 4) * 60, 4: (4 + 4 + 5) * 60, 5: (4 + 4 + 5 + 6) * 60 } },
	high: { firstResponse: 45, marks: { 2: 8 * 60, 3: (8 + 8) * 60, 4: (8 + 8 + 9) * 60, 5: (8 + 8 + 9 + 10) * 60 } },
	medium: { firstResponse: 60, marks: { 2: 16 * 60, 3: (16 + 16) * 60, 4: (16 + 16 + 17) * 60, 5: (16 + 16 + 17 + 18) * 60 } },
	low: { firstResponse: 240, marks: { 2: 32 * 60, 3: (32 + 32) * 60, 4: (32 + 32 + 33) * 60, 5: null } },
};

test('maps Jira priorities onto contract severities', () => {
	assert.equal(severityFor('Highest'), 'critical');
	assert.equal(severityFor('High'), 'high');
	assert.equal(severityFor('Medium'), 'medium');
	assert.equal(severityFor('Low'), 'low');
	assert.equal(severityFor('Lowest'), 'low');
	assert.equal(severityFor('None'), null);
	assert.equal(severityFor('Blocker'), null);
});

test('carries the contractual first response window', () => {
	for (const [severity, expected] of Object.entries(CONTRACT)) {
		assert.equal(firstResponseMinutes(severity as Severity), expected.firstResponse, severity);
	}
});

test('reaches each escalation level exactly at its contractual mark', () => {
	for (const [severity, { marks }] of Object.entries(CONTRACT)) {
		const key = severity as Severity;
		assert.equal(dueLevel(key, 0), null, `${severity} at zero`);
		let previous: ContactLevel | null = null;
		for (const level of [2, 3, 4, 5] as ContactLevel[]) {
			const mark = marks[level];
			if (mark === null) {
				// Low has no L5 clock mark, so it is never reached automatically.
				assert.equal(dueLevel(key, 100_000), previous, `${severity} L5 has no mark`);
				continue;
			}
			assert.equal(dueLevel(key, mark - 1), previous, `${severity} one minute before L${level}`);
			assert.equal(dueLevel(key, mark), level, `${severity} at L${level}`);
			previous = level;
		}
	}
});

test('escalates sequentially inside calendar hours', () => {
	for (const severity of ['critical', 'high', 'medium', 'low'] as Severity[]) {
		assert.deepEqual(planEscalation(severity, 3, true), { levels: [3], surfaceOnCall: false }, severity);
	}
});

test('notifies L1 and L2 in parallel off-hours for Critical and High only', () => {
	assert.deepEqual(planEscalation('critical', 2, false), { levels: [1, 2], surfaceOnCall: true });
	assert.deepEqual(planEscalation('high', 4, false), { levels: [1, 2, 4], surfaceOnCall: true });
	assert.deepEqual(planEscalation('medium', 3, false), { levels: [3], surfaceOnCall: false });
	assert.deepEqual(planEscalation('low', 2, false), { levels: [2], surfaceOnCall: false });
});

test('selects only levels not already notified for that ticket', () => {
	const tickets = [
		ticket({ key: 'DC-1', priority: 'Highest', resolutionSla: cycle({ elapsedMinutes: 800 }) }),
		ticket({ key: 'DC-2', priority: 'Highest', resolutionSla: cycle({ elapsedMinutes: 800 }) }),
	];
	const notified = new Map([['DC-2', 4]]);
	const selected = selectEscalations(tickets, (key) => notified.get(key) ?? 0);
	assert.deepEqual(selected.map((candidate) => [candidate.ticket.key, candidate.level]), [['DC-1', 4]]);
});

test('ignores tickets with no escalation clock to read', () => {
	const selected = selectEscalations(
		[
			ticket({ key: 'NO-METRIC', resolutionSla: null }),
			ticket({ key: 'PAUSED', resolutionSla: cycle({ paused: true, elapsedMinutes: 5_000 }) }),
			ticket({ key: 'RESOLVED', resolutionSla: cycle({ state: 'completed', elapsedMinutes: 5_000 }) }),
			ticket({ key: 'NO-ELAPSED', resolutionSla: cycle({ elapsedMinutes: null }) }),
			ticket({ key: 'UNMAPPED-PRIORITY', priority: 'None', resolutionSla: cycle({ elapsedMinutes: 5_000 }) }),
			ticket({ key: 'TOO-EARLY', resolutionSla: cycle({ elapsedMinutes: 10 }) }),
		],
		() => 0,
	);
	assert.deepEqual(selected, []);
});

function ticket(overrides: Partial<JiraTicket> = {}): JiraTicket {
	return {
		key: 'DC-1',
		summary: 'Synthetic summary',
		status: 'In Progress',
		priority: 'Medium',
		assignee: 'Developer',
		assigneeAccountId: 'account-1',
		url: 'https://jira.invalid/browse/DC-1',
		firstResponseSla: null,
		participants: [],
		resolutionSla: cycle(),
		...overrides,
	};
}

function cycle(overrides: Partial<SlaCycle> = {}): SlaCycle {
	return {
		name: 'Time to resolution',
		state: 'ongoing',
		breached: true,
		paused: false,
		withinCalendarHours: true,
		breachTimeEpochMillis: null,
		elapsedMinutes: 0,
		...overrides,
	};
}
