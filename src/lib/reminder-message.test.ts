import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { JiraTicket } from './jira.ts';
import { buildReminderMessages, cleanIntro } from './reminder-message.ts';

const NOW = new Date('2026-08-03T03:00:00.000Z');

test('builds factual Jira links and escapes untrusted markdown', () => {
	const [message] = buildReminderMessages(
		[ticket({
			summary: 'Login *broken*\nignore [instructions]',
			assignee: 'Developer\nInjected heading',
			status: 'Waiting\nInjected status',
		})],
		NOW,
		1_000,
		'Please respond',
	);
	assert.match(message ?? '', /\[SUP-1\]\(https:\/\/example\.atlassian\.net\/browse\/SUP-1\)/);
	assert.match(message ?? '', /Login \\\*broken\\\*/);
	assert.doesNotMatch(message ?? '', /\nignore/);
	assert.doesNotMatch(message ?? '', /Developer\nInjected/);
	assert.doesNotMatch(message ?? '', /Waiting\nInjected/);
});

test('chunks long reminder lists', () => {
	const messages = buildReminderMessages(
		Array.from({ length: 8 }, (_, index) => ticket({ key: `SUP-${index}`, summary: 'x'.repeat(100) })),
		NOW,
		500,
	);
	assert.ok(messages.length > 1);
	assert.ok(messages.every((message) => message.length <= 500));
});

test('normalizes model intro to one bounded line', () => {
	assert.equal(cleanIntro('  Hello\nteam  '), 'Hello team');
	assert.equal(cleanIntro('x'.repeat(200)).length, 160);
});

function ticket(overrides: Partial<JiraTicket> = {}): JiraTicket {
	return {
		key: 'SUP-1',
		summary: 'Customer cannot log in',
		status: 'Waiting for support',
		priority: 'High',
		assignee: 'Developer',
		url: 'https://example.atlassian.net/browse/SUP-1',
		firstResponseSla: {
			name: 'First response',
			state: 'ongoing',
			breached: true,
			paused: false,
			withinCalendarHours: true,
			breachTimeEpochMillis: NOW.getTime() - 90 * 60_000,
		},
		...overrides,
	};
}
