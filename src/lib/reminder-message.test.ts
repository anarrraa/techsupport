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

test('neutralizes renderer-sensitive Jira fields without changing the Jira link', () => {
	const jiraUrl = 'https://example.atlassian.net/browse/SUP-1%5D';
	const [message] = buildReminderMessages(
		[ticket({
			assignee: 'Dev <https://evil.example/assignee> **lead**\nnext',
			priority: 'High [priority](https://evil.example/priority)',
			status: '<b>Open</b> www.evil.example/status',
			summary: '`summary` ![pixel](https://evil.example/summary)',
			key: 'SUP-1](https://evil.example/key)',
			url: jiraUrl,
		})],
		NOW,
		2_000,
		'Please respond',
	);

	assert.equal(message?.match(new RegExp(escapeRegExp(jiraUrl), 'g'))?.length, 1);
	assert.doesNotMatch(message ?? '', /[<>]/);
	assert.doesNotMatch(message ?? '', /https:\/\/evil\.example/);
	assert.doesNotMatch(message ?? '', /www\.evil\.example/);
	assert.doesNotMatch(message ?? '', /\nnext/);
	assert.match(message ?? '', /\\`summary\\`/);
	assert.match(message ?? '', /\\\*\\\*lead\\\*\\\*/);
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

test('renders every input ticket exactly once across chunks', () => {
	const tickets = Array.from({ length: 24 }, (_, index) => {
		const key = `UNIQUE${String(index).padStart(2, '0')}`;
		return ticket({
			key,
			url: `https://example.atlassian.net/browse/${key}`,
			assignee: index % 2 === 0 ? 'Developer A' : 'Developer B',
			summary: `Ticket marker ${key} ${'x'.repeat(100)}`,
		});
	});
	const messages = buildReminderMessages(tickets, NOW, 1_000);
	const output = messages.join('\n');

	assert.ok(messages.length > 1);
	for (const input of tickets) {
		assert.equal(output.match(new RegExp(escapeRegExp(input.url), 'g'))?.length, 1, input.key);
	}
});

test('keeps group and continuation chunks within maxChars', () => {
	const maxChars = 1_000;
	const messages = buildReminderMessages(
		Array.from({ length: 30 }, (_, index) => ticket({
			key: `BOUNDARY${index}`,
			url: `https://example.atlassian.net/browse/BOUNDARY${index}`,
			assignee: `${'Long group name '.repeat(8)}${index % 3}`,
			summary: `${'Long summary with [markdown] and https://evil.example/ '.repeat(5)}${index}`,
		})),
		NOW,
		maxChars,
	);

	assert.ok(messages.length > 2);
	assert.ok(messages.every((message) => message.length <= maxChars));
	assert.ok(messages.slice(1).every((message) => message.includes('SLA сануулгын үргэлжлэл:')));
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

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
