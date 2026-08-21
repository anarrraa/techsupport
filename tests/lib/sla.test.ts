import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { JiraTicket } from '../../src/lib/jira.ts';
import { isReminderWindow, selectReminderTickets } from '../../src/lib/sla.ts';

const NOW = new Date('2026-08-03T03:00:00.000Z');

test('selects a currently breached SLA in its delivery window', () => {
	const result = selectReminderTickets([ticket()], NOW, 60, 15);
	assert.deepEqual(result.due.map((value) => value.key), ['SUP-1']);
});

test('suppresses reminders outside the JSM calendar', () => {
	const result = selectReminderTickets(
		[ticket({ firstResponseSla: sla({ withinCalendarHours: false }) })],
		NOW,
		60,
		15,
	);
	assert.equal(result.due.length, 0);
	assert.equal(result.suppressedOutsideCalendar, 1);
});

test('ignores paused and completed SLA cycles', () => {
	const result = selectReminderTickets(
		[
			ticket({ key: 'PAUSED', firstResponseSla: sla({ paused: true }) }),
			ticket({ key: 'NOT-BREACHED', firstResponseSla: sla({ breached: false }) }),
			ticket({
				key: 'DONE',
				firstResponseSla: sla({ state: 'completed', breached: false }),
			}),
		],
		NOW,
		60,
		15,
	);
	assert.equal(result.due.length, 0);
});

test('opens one delivery window per repeat interval', () => {
	const breach = Date.parse('2026-08-03T02:00:00.000Z');
	assert.equal(isReminderWindow(breach, Date.parse('2026-08-03T02:05:00.000Z'), 60, 15), true);
	assert.equal(isReminderWindow(breach, Date.parse('2026-08-03T02:14:59.999Z'), 60, 15), true);
	assert.equal(isReminderWindow(breach, Date.parse('2026-08-03T02:15:00.000Z'), 60, 15), false);
	assert.equal(isReminderWindow(breach, Date.parse('2026-08-03T02:20:00.000Z'), 60, 15), false);
	assert.equal(isReminderWindow(breach, Date.parse('2026-08-03T03:10:00.000Z'), 60, 15), true);
});

test('sorts by priority and then longest overdue', () => {
	const result = selectReminderTickets(
		[
			ticket({ key: 'LOW', priority: 'Low' }),
			ticket({ key: 'HIGH-NEW', priority: 'High' }),
			ticket({
				key: 'HIGH-OLD',
				priority: 'High',
				firstResponseSla: sla({ breachTimeEpochMillis: NOW.getTime() - 120 * 60_000 }),
			}),
		],
		NOW,
		60,
		15,
	);
	assert.deepEqual(result.due.map((value) => value.key), ['HIGH-OLD', 'HIGH-NEW', 'LOW']);
});

function ticket(overrides: Partial<JiraTicket> = {}): JiraTicket {
	return {
		key: 'SUP-1',
		summary: 'Customer cannot log in',
		status: 'Waiting for support',
		priority: 'Medium',
		assignee: 'Developer',
		url: 'https://example.atlassian.net/browse/SUP-1',
		firstResponseSla: sla(),
		...overrides,
	};
}

function sla(overrides: Partial<NonNullable<JiraTicket['firstResponseSla']>> = {}) {
	return {
		name: 'Time To First Response',
		state: 'ongoing' as const,
		breached: true,
		paused: false,
		withinCalendarHours: true,
		breachTimeEpochMillis: NOW.getTime() - 60 * 60_000,
		...overrides,
	};
}

test('partitions every scanned ticket into exactly one bucket', () => {
	const tickets = [
		ticket({ firstResponseSla: sla({ breached: false }) }),
		ticket({ firstResponseSla: sla({ paused: true }) }),
		ticket({ firstResponseSla: sla({ state: 'completed' }) }),
		ticket({ firstResponseSla: sla({ withinCalendarHours: false }) }),
	];
	const selection = selectReminderTickets(tickets, NOW, 60, 15);
	const accounted =
		selection.due.length
		+ selection.ineligible
		+ selection.suppressedOutsideCalendar
		+ selection.waitingForNextWindow;

	assert.equal(selection.ineligible, 3);
	assert.equal(selection.suppressedOutsideCalendar, 1);
	assert.equal(accounted, tickets.length);
});
