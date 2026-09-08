import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { JiraTicket } from '../../src/lib/jira.ts';
import {
	elapsedSinceRaisedMinutes,
	isReminderWindow,
	overdueMinutes,
	selectReminderTickets,
} from '../../src/lib/sla.ts';

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

test('overdue is time past the target, not time since the request was raised', () => {
	// Shaped like a real JSM payload: elapsedTime runs from the cycle starting,
	// so a breached cycle's elapsed still contains the whole allowance.
	// DC-898 reported goal=60, elapsed=259, remaining=-200 — 199 minutes past
	// its target, not 259. Reading elapsed made every "хэтэрсэн" figure wrong by
	// exactly the allowance, and every fixture in this file had hidden it by
	// leaving remainingMinutes null.
	const breached = ticket({
		firstResponseSla: sla({ elapsedMinutes: 259, remainingMinutes: -200 }),
	});
	assert.equal(overdueMinutes(breached, NOW), 200);
	assert.notEqual(overdueMinutes(breached, NOW), 259);

	// Escalation marks are stated from the request being raised, so that path
	// keeps reading elapsed — the two must not converge again.
	assert.equal(elapsedSinceRaisedMinutes(breached.firstResponseSla), 259);

	// A cycle inside its target is not overdue at all.
	const healthy = ticket({ firstResponseSla: sla({ elapsedMinutes: 20, remainingMinutes: 40 }) });
	assert.equal(overdueMinutes(healthy, NOW), 0);

	// With no remainingTime, fall back to clock time since the breach.
	const noRemaining = ticket({
		firstResponseSla: sla({
			elapsedMinutes: 5_000,
			remainingMinutes: null,
			breachTimeEpochMillis: NOW.getTime() - 30 * 60_000,
		}),
	});
	assert.equal(overdueMinutes(noRemaining, NOW), 30);
});

test('an open window reaches every breach on a sparse schedule', () => {
	// The schedule is twice a working day, at 10:00 and 15:00 Ulaanbaatar time.
	// The gaps are 300 and 1140 minutes, both whole multiples of 60, so
	// `elapsed % 60` is the same at every run for a given request: a narrower
	// window than the repeat interval would lock three quarters of breaches out
	// permanently. Equal window and repeat is what makes the schedule the
	// cadence rather than a lottery.
	const runsOverAWeek: number[] = [];
	for (let day = 0; day < 5; day += 1) {
		runsOverAWeek.push(day * 1_440 + 600, day * 1_440 + 900);
	}
	const reachable = (repeat: number, window: number) => {
		let count = 0;
		for (let offset = 0; offset < 60; offset += 1) {
			if (runsOverAWeek.some((run) => isReminderWindow(0, (offset + run) * 60_000, repeat, window))) {
				count += 1;
			}
		}
		return count;
	};
	assert.equal(reachable(60, 60), 60, 'an open window must reach every breach');
	assert.ok(reachable(60, 15) < 20, 'a narrow window on this schedule locks most breaches out');
});

test('a run interval that is a whole multiple of the repeat locks tickets out', () => {
	// The reason the schedule is */15 and not daily. A daily run advances
	// elapsed-since-breach by 1440 minutes, and 1440 % 60 === 0, so the verdict
	// for a given breach never changes: whoever is outside the window is outside
	// it forever. Sampling every 15 minutes reaches every offset instead.
	const daily = (offset: number) =>
		Array.from({ length: 7 }, (_, day) =>
			isReminderWindow(0, (offset + day * 1_440) * 60_000, 60, 15));
	assert.deepEqual(new Set(daily(20)), new Set([false]));
	assert.deepEqual(new Set(daily(47)), new Set([false]));

	for (const offset of [3, 20, 47]) {
		const quarterHourly = Array.from({ length: 8 }, (_, run) =>
			isReminderWindow(0, (offset + run * 15) * 60_000, 60, 15));
		assert.ok(
			quarterHourly.some(Boolean),
			`offset ${offset} must be reminded at least once per hour`,
		);
	}
});

function ticket(overrides: Partial<JiraTicket> = {}): JiraTicket {
	return {
		key: 'SUP-1',
		summary: 'Customer cannot log in',
		status: 'Waiting for support',
		priority: 'Medium',
		assignee: 'Developer',
		assigneeAccountId: 'account-1',
		url: 'https://example.atlassian.net/browse/SUP-1',
		firstResponseSla: sla(),
		participants: [],
		resolutionSla: null,
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
		elapsedMinutes: null,
		remainingMinutes: null,
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
