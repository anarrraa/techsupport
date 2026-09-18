import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { JiraTicket } from '../../src/lib/jira.ts';
import type { TicketDigest } from '../../src/lib/ticket-digest.ts';
import { buildDirectMessages, buildReminderMessages, cleanIntro } from '../../src/lib/reminder-message.ts';

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
	assert.deepEqual(markdownTargets(message ?? ''), ['https://example.atlassian.net/browse/SUP-1']);
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

test('keeps one trusted Jira link in a compact continuation at the max boundary', () => {
	const trustedUrl = `https://example.atlassian.net/${'segment/'.repeat(90)}browse/SUP-2`;
	const messages = buildReminderMessages(
		[
			ticket({ summary: 'x'.repeat(180) }),
			ticket({ key: 'SUP-2', url: trustedUrl, summary: 'y'.repeat(180) }),
		],
		NOW,
		1_000,
	);
	const output = messages.join('\n');

	assert.equal(messages.length, 2);
	assert.ok(messages.every((message) => message.length <= 1_000));
	assert.equal(output.match(new RegExp(escapeRegExp(trustedUrl), 'g'))?.length, 1);
	assert.deepEqual(markdownTargets(output), [
		'https://example.atlassian.net/browse/SUP-1',
		trustedUrl,
	]);
	assert.ok(messages[1]?.includes(`- [SUP-2](${trustedUrl}) · High · 1ц 30м хэтэрсэн`));
});

test('uses the exact trusted Jira target in the link-only representation', () => {
	const trustedUrl = 'https://example.atlassian.net/browse/SUP-1';
	const [message] = buildReminderMessages([ticket({ url: trustedUrl })], NOW, 216);

	assert.ok((message?.length ?? Infinity) <= 216);
	assert.deepEqual(markdownTargets(message ?? ''), [trustedUrl]);
	assert.match(message ?? '', new RegExp(`^- \\[SUP-1\\]\\(${escapeRegExp(trustedUrl)}\\)$`, 'm'));
});

test('fails when maxChars cannot contain the required trusted Jira link', () => {
	const trustedUrl = `https://example.atlassian.net/${'segment/'.repeat(110)}browse/SUP-1`;

	assert.throws(
		() => buildReminderMessages([ticket({ url: trustedUrl })], NOW, 1_000),
		{
			name: 'RangeError',
			message: 'Message character limit cannot contain the required Jira ticket link',
		},
	);
});

test('sanitizes renderer-active model intros and preserves the deterministic fallback', () => {
	const intro = cleanIntro(
		'<b>Alert</b> [click](https://evil.example/two) <https://evil.example/three>',
	);

	assert.doesNotMatch(intro, /[<>]/);
	assert.doesNotMatch(intro, /https:\/\/evil\.example/);
	assert.match(intro, /&lt;b&gt;Alert&lt;\/b&gt;/);
	assert.match(intro, /\\\[click\\\]\\\(https\\\[:\\\]\/\/evil\\\[\.\\\]example\/two\\\)/);
	assert.equal(
		cleanIntro('\u202e\u200b\n'),
		'Манай туршлагатай, хариуцлагатай багийнхан аа, дараах тикетүүдийн SLA хугацаа хэтэрсэн тул шалгаж хариу өгнө үү.',
	);
	assert.equal(cleanIntro('x'.repeat(200)).length, 160);
});

test('neutralizes only Unicode-aware link candidates with visible delimiters', () => {
	assert.equal(
		cleanIntro('Release v1.2 A.B portal.\u202eрф user@\u200bexample.com https://evil.example/path'),
		'Release v1.2 A.B portal\\[.\\]рф user\\[@\\]example\\[.\\]com https\\[:\\]//evil\\[.\\]example/path',
	);
});

test('preserves valid join controls while removing dangerous and C0/C1 controls', () => {
	assert.equal(cleanIntro('👩‍💻 می‌روم'), '👩‍💻 می‌روم');
	assert.equal(cleanIntro('Hello\t\u0000world\u001b'), 'Hello world');
	assert.equal(
		cleanIntro('\u0000\u001b\u0085\u202e\u200b'),
		'Манай туршлагатай, хариуцлагатай багийнхан аа, дараах тикетүүдийн SLA хугацаа хэтэрсэн тул шалгаж хариу өгнө үү.',
	);
});

test('an escalation message quotes the resolution clock, not the first-response one', () => {
	// A request can sit far past its resolution mark while its first-response
	// cycle reports nothing, so quoting the wrong clock prints 0 on a message
	// that exists precisely because time has run out.
	const escalating = ticket({
		key: 'DC-811',
		firstResponseSla: null,
		resolutionSla: {
			name: 'Time to resolution',
			state: 'ongoing',
			breached: true,
			paused: false,
			withinCalendarHours: true,
			breachTimeEpochMillis: null,
			elapsedMinutes: 67 * 60,
			remainingMinutes: null,
		},
	});

	const escalation = buildDirectMessages({
		recipientName: 'Lead',
		kind: 'escalation',
		level: 3,
		tickets: [escalating],
		now: NOW,
		maxChars: 12_000,
	}).join('\n');
	assert.match(escalation, /67ц шийдэгдээгүй/);
	assert.doesNotMatch(escalation, /0м/);

	const reminder = buildDirectMessages({
		recipientName: 'Dev',
		kind: 'first-response',
		level: 1,
		tickets: [escalating],
		now: NOW,
		maxChars: 12_000,
	}).join('\n');
	assert.match(reminder, /хэтэрсэн/);
	assert.doesNotMatch(reminder, /шийдэгдээгүй/);
});

function ticket(overrides: Partial<JiraTicket> = {}): JiraTicket {
	return {
		key: 'SUP-1',
		summary: 'Customer cannot log in',
		status: 'Waiting for support',
		priority: 'High',
		assignee: 'Developer',
		assigneeAccountId: 'account-1',
		comments: [],
		url: 'https://example.atlassian.net/browse/SUP-1',
		firstResponseSla: {
			name: 'First response',
			state: 'ongoing',
			breached: true,
			paused: false,
			withinCalendarHours: true,
			breachTimeEpochMillis: NOW.getTime() - 90 * 60_000,
			elapsedMinutes: 90,
			remainingMinutes: null,
		},
		participants: [],
		resolutionSla: null,
		...overrides,
	};
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function markdownTargets(message: string): string[] {
	return Array.from(message.matchAll(/\[[^\]\n]+\]\(([^)\s]+)\)/g), (match) => match[1] as string);
}

test('renders the digest as an indented second line, sanitized like any Jira field', () => {
	// The digest is model prose written over client-authored comments, so it is
	// exactly as untrusted as a summary and must not be able to inject markdown,
	// HTML, or a clickable link of its own.
	const [message] = buildReminderMessages(
		[ticket({ key: 'DC-926' })],
		NOW,
		2_000,
		'Please respond',
		new Map([['DC-926', digest({
			text: 'Client asked for **bold** logs at https://evil.example/digest > see there',
			name: 'Batbayar',
		})]]),
	);

	assert.match(message ?? '', /\n {2}↳ /);
	assert.match(message ?? '', /\\\*\\\*bold\\\*\\\*/);
	assert.doesNotMatch(message ?? '', /https:\/\/evil\.example/);
	assert.match(message ?? '', /https\\\[:\\\]\/\/evil\\\[\.\\\]example/);
	assert.doesNotMatch(message ?? '', /[<>]/);
	assert.match(message ?? '', /&gt; see there/);
	assert.match(message ?? '', /· Одоо: Batbayar$/m);
	// The link is still the only markdown target in the message.
	assert.deepEqual(markdownTargets(message ?? ''), ['https://example.atlassian.net/browse/SUP-1']);
});

test('names the client instead of inventing an owner when the ball is on their side', () => {
	const [message] = buildReminderMessages(
		[ticket({ key: 'DC-926' })],
		NOW,
		2_000,
		'Please respond',
		new Map([['DC-926', digest({
			text: 'Сүүлд үйлчлүүлэгч бичсэн.',
			name: 'Batbayar',
			awaitingClient: true,
		})]]),
	);

	assert.match(message ?? '', /· Үйлчлүүлэгчийн хариу хүлээж байна$/m);
	assert.doesNotMatch(message ?? '', /Одоо:/);
	assert.doesNotMatch(message ?? '', /Batbayar/);
});

test('a ticket with no digest in the map renders exactly as it does today', () => {
	const tickets = [ticket({ key: 'DC-1' }), ticket({ key: 'DC-2' })];
	const withDigests = buildReminderMessages(
		tickets,
		NOW,
		2_000,
		'Please respond',
		new Map([['DC-1', digest({ text: 'Сүүлд хариу өгсөн.' })]]),
	);
	const without = buildReminderMessages(tickets, NOW, 2_000, 'Please respond');

	const undigested = (withDigests.join('\n').match(/^- \[DC-2\].*$/m) ?? [])[0];
	assert.equal(undigested, (without.join('\n').match(/^- \[DC-2\].*$/m) ?? [])[0]);
	assert.equal(withDigests.join('\n').match(/ {2}↳ /g)?.length, 1);
});

test('drops the digest line before compacting the ticket row', () => {
	const digested = new Map([['SUP-1', digest({ text: 'x'.repeat(200), name: 'Batbayar' })]]);
	const full = buildReminderMessages([ticket()], NOW, 2_000, 'Please respond', digested);
	const plain = buildReminderMessages([ticket()], NOW, 2_000, 'Please respond');
	// One character short of fitting the digest line, and nothing else.
	const tight = (full[0] as string).length - 1;

	const squeezed = buildReminderMessages([ticket()], NOW, tight, 'Please respond', digested);
	assert.equal(squeezed.length, 1);
	assert.doesNotMatch(squeezed[0] as string, /↳/);
	// The full row survived: the digest went first, the summary and status stayed.
	assert.equal(squeezed[0], plain[0]);
	assert.match(squeezed[0] as string, /Customer cannot log in/);
	assert.match(squeezed[0] as string, /\(https:\/\/example\.atlassian\.net\/browse\/SUP-1\)/);
});

test('the link survives even when the digest and the row both have to go', () => {
	const message = buildReminderMessages(
		[ticket({ summary: 'y'.repeat(300) })],
		NOW,
		260,
		'Please respond',
		new Map([['SUP-1', digest({ text: 'z'.repeat(200) })]]),
	).at(-1) as string;

	assert.doesNotMatch(message, /↳/);
	assert.deepEqual(markdownTargets(message), ['https://example.atlassian.net/browse/SUP-1']);
});

function digest(overrides: Partial<TicketDigest> = {}): TicketDigest {
	return {
		text: 'Сүүлд манай талаас хариу алга.',
		source: 'fallback',
		handle: null,
		name: null,
		awaitingClient: false,
		lastCommentAgeMinutes: 30,
		...overrides,
	};
}
