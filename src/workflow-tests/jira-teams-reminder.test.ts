import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AppConfig } from '../lib/config.ts';
import type { JiraFetchResult, JiraTicket } from '../lib/jira.ts';
import { runJiraTeamsReminder } from '../workflows/jira-teams-reminder.ts';

const NOW = new Date('2026-08-03T03:00:00.000Z');

test('does not post to Teams when no ticket is due', async () => {
	const posts: string[] = [];
	const result = await run({
		tickets: [],
		post: async (message) => {
			posts.push(message);
		},
	});

	assert.deepEqual(posts, []);
	assert.deepEqual(result.output, {
		scanned: 0,
		ticketCount: 0,
		messageCount: 0,
		notified: false,
		developerCount: 0,
	});
});

test('dry-run skips Teams and exposes aggregate-only logs, model input, and output', async () => {
	const privateTicket = ticket({
		key: 'PRIVATE-42',
		summary: 'Private customer summary',
		status: 'Private status',
		assignee: 'Private Developer',
		url: 'https://jira.invalid/browse/PRIVATE-42',
	});
	const posts: string[] = [];
	let modelInput = '';
	const result = await run({
		tickets: [privateTicket],
		config: config({ dryRun: true, useLlmIntro: true }),
		generateIntro: async (input) => {
			modelInput = input;
			return 'Aggregate intro';
		},
		post: async (message) => {
			posts.push(message);
		},
	});

	assert.deepEqual(posts, []);
	assert.deepEqual(result.output, {
		scanned: 1,
		ticketCount: 1,
		messageCount: 1,
		notified: false,
		developerCount: 1,
	});
	assert.deepEqual(JSON.parse(modelInput), {
		ticketCount: 1,
		developerCount: 1,
		priorities: { High: 1 },
	});
	const observableText = JSON.stringify({ logs: result.logs, output: result.output, modelInput });
	for (const privateValue of [
		privateTicket.key,
		privateTicket.summary,
		privateTicket.status,
		privateTicket.assignee,
		privateTicket.url,
	]) {
		assert.doesNotMatch(observableText, new RegExp(privateValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
	}
});

test('posts message chunks in order', async () => {
	const posts: string[] = [];
	await run({
		buildMessages: () => ['chunk one', 'chunk two', 'chunk three'],
		post: async (message) => {
			posts.push(message);
		},
	});

	assert.deepEqual(posts, ['chunk one', 'chunk two', 'chunk three']);
});

test('surfaces a Teams delivery failure', async () => {
	await assert.rejects(
		run({
			post: async () => {
				throw new Error('synthetic Teams failure');
			},
		}),
		/synthetic Teams failure/,
	);
});

test('falls back to deterministic copy and delivers when Gemini fails', async () => {
	const posts: string[] = [];
	const result = await run({
		config: config({ useLlmIntro: true }),
		generateIntro: async () => {
			throw new Error('PRIVATE-42');
		},
		post: async (message) => {
			posts.push(message);
		},
	});

	assert.equal(posts.length, 1);
	assert.match(posts[0] ?? '', /SLA хэтэрсэн байна/);
	assert.match(result.logs.join('\n'), /using deterministic copy: Error/);
	assert.doesNotMatch(result.logs.join('\n'), /PRIVATE-42/);
});

test('cancels a stalled Gemini intro, releases its handle, and still delivers', async () => {
	const posts: string[] = [];
	let cancelled = false;
	let active = false;
	const startedAt = Date.now();
	const result = await run({
		config: config({ useLlmIntro: true, timeoutMs: 10 }),
		generateIntro: (_input, signal) => new Promise((_resolve, reject) => {
			assert.ok(signal);
			active = true;
			const handle = setInterval(() => {}, 1_000);
			signal.addEventListener('abort', () => {
				cancelled = true;
				active = false;
				clearInterval(handle);
				reject(signal.reason);
			}, { once: true });
		}),
		post: async (message) => {
			posts.push(message);
		},
	});

	assert.equal(posts.length, 1);
	assert.ok(Date.now() - startedAt < 500);
	assert.equal(cancelled, true);
	assert.equal(active, false);
	assert.match(result.logs.join('\n'), /using deterministic copy: TimeoutError/);
});

interface RunOptions {
	tickets?: JiraTicket[];
	config?: AppConfig;
	generateIntro?: (input: string, signal: AbortSignal) => Promise<string>;
	buildMessages?: () => string[];
	post?: (message: string) => Promise<void>;
}

async function run(options: RunOptions = {}) {
	const logs: string[] = [];
	const tickets = options.tickets ?? [ticket()];
	const output = await runJiraTeamsReminder({
		config: options.config ?? config(),
		now: NOW,
		generateIntro: options.generateIntro,
		log: {
			info: (message) => logs.push(message),
			warn: (message) => logs.push(message),
		},
		dependencies: {
			fetchTickets: async (): Promise<JiraFetchResult> => ({
				tickets,
				scanned: tickets.length,
				withoutSla: 0,
				truncated: false,
			}),
			...(options.buildMessages ? { buildReminderMessages: options.buildMessages } : {}),
			postToChannel: async (message) => options.post?.(message),
		},
	});
	return { logs, output };
}

function config(
	overrides: { dryRun?: boolean; useLlmIntro?: boolean; timeoutMs?: number } = {},
): AppConfig {
	const http = { timeoutMs: overrides.timeoutMs ?? 1_000, maxRetries: 0 };
	return {
		http,
		jira: {
			baseUrl: 'https://jira.invalid',
			email: 'synthetic@example.invalid',
			apiToken: 'synthetic-token',
			jql: 'project = SYNTHETIC',
			pageSize: 10,
			maxResults: 10,
			maxSearchPages: 1,
			slaPageSize: 10,
			maxSlaPages: 1,
			slaConcurrency: 1,
			firstResponseSlaName: 'First response',
			http,
		},
		teamsWebhookUrl: 'https://teams.invalid/webhook',
		reminder: {
			repeatMinutes: 60,
			deliveryWindowMinutes: 15,
			useLlmIntro: overrides.useLlmIntro ?? false,
			dryRun: overrides.dryRun ?? false,
			maxMessageChars: 12_000,
		},
	};
}

function ticket(overrides: Partial<JiraTicket> = {}): JiraTicket {
	return {
		key: 'SYNTHETIC-1',
		summary: 'Synthetic summary',
		status: 'Waiting',
		priority: 'High',
		assignee: 'Synthetic Developer',
		url: 'https://jira.invalid/browse/SYNTHETIC-1',
		firstResponseSla: {
			name: 'First response',
			state: 'ongoing',
			breached: true,
			paused: false,
			withinCalendarHours: true,
			breachTimeEpochMillis: NOW.getTime() - 60 * 60_000,
		},
		...overrides,
	};
}
