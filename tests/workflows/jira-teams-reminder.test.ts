import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AppConfig } from '../../src/lib/config.ts';
import type { EscalationConfig } from '../../src/lib/escalation-config.ts';
import type { EscalationState } from '../../src/lib/escalation-state.ts';
import type { JiraFetchResult, JiraTicket, SlaCycle } from '../../src/lib/jira.ts';
import { TeamsDeliveryError, type DirectMessage } from '../../src/lib/teams-bot.ts';
import { runJiraTeamsReminder } from '../../src/workflows/jira-teams-reminder.ts';

const NOW = new Date('2026-08-03T03:00:00.000Z');

test('does not post to Teams when no ticket is due', async () => {
	const posts: string[] = [];
	const result = await run({
		tickets: [ticket({ firstResponseSla: { ...ticket().firstResponseSla!, breached: false } })],
		post: async (message) => {
			posts.push(message);
		},
	});

	assert.deepEqual(posts, []);
	assert.deepEqual(result.output, {
		scanned: 1,
		ticketCount: 0,
		messageCount: 0,
		notified: false,
		developerCount: 0,
		directMessageCount: 0,
		escalationCount: 0,
	});
});

test('fails when scanned is 0 in non-dry-run mode', async () => {
	await assert.rejects(
		run({
			tickets: [],
			config: config({ dryRun: false }),
			post: async () => {},
		}),
		/Jira search returned 0 issues/,
	);
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
		directMessageCount: 0,
		escalationCount: 0,
	});
	assert.deepEqual(JSON.parse(modelInput), {
		ticketCount: 1,
		developerCount: 1,
		priorities: { High: 1 },
	});
	const observableText = JSON.stringify({
		logs: result.logs,
		attributes: result.attributes,
		output: result.output,
		modelInput,
	});
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
	assert.match(posts[0] ?? '', /SLA хугацаа хэтэрсэн/);
	assert.match(result.logs.join('\n'), /fell back to the deterministic opener: error/);
	assert.ok(result.attributes.some((entry) => entry.errorName === 'Error'));
	assert.doesNotMatch(JSON.stringify({ logs: result.logs, attributes: result.attributes }), /PRIVATE-42/);
});

test('escapes a model intro exactly once', async () => {
	const posts: string[] = [];
	await run({
		config: config({ useLlmIntro: true }),
		generateIntro: async () => 'Сануулга *чухал* [одоо]',
		post: async (message) => {
			posts.push(message);
		},
	});

	const message = posts[0] ?? '';
	assert.match(message, /Сануулга \\\*чухал\\\* \\\[одоо\\\]/);
	assert.doesNotMatch(message, /\\\\/);
});

test('still delivers when the intro times out', async () => {
	const posts: string[] = [];
	const result = await run({
		config: config({ useLlmIntro: true, timeoutMs: 10 }),
		generateIntro: (_input, signal) => new Promise((_resolve, reject) => {
			signal.addEventListener('abort', () => reject(signal.reason), { once: true });
		}),
		post: async (message) => {
			posts.push(message);
		},
	});

	assert.equal(posts.length, 1);
	assert.match(posts[0] ?? '', /SLA хугацаа хэтэрсэн/);
	assert.match(result.logs.join('\n'), /fell back to the deterministic opener: timeout/);
	assert.ok(result.attributes.some((entry) => entry.errorName === 'TimeoutError'));
});

test('direct-messages the assignee alongside the channel post', async () => {
	const posts: string[] = [];
	const result = await run({
		config: config({ bot: true }),
		post: async (message) => {
			posts.push(message);
		},
	});

	assert.equal(posts.length, 1);
	assert.deepEqual(result.sent.map((message) => message.entraObjectId), [DEV]);
	assert.match(result.sent[0]?.text ?? '', /Сайн байна уу, Synthetic Developer\./);
	assert.equal(result.output.directMessageCount, 1);
	assert.equal(result.output.notified, true);
});

test('delivers direct messages with no channel webhook configured', async () => {
	const posts: string[] = [];
	const result = await run({
		config: config({ bot: true, webhook: false }),
		post: async (message) => {
			posts.push(message);
		},
	});

	assert.deepEqual(posts, []);
	assert.equal(result.output.messageCount, 0);
	assert.equal(result.output.directMessageCount, 1);
	assert.equal(result.output.notified, true);
});

test('dry-run sends no direct message and logs counts only', async () => {
	const result = await run({
		config: config({ bot: true, dryRun: true }),
		tickets: [ticket({ resolutionSla: resolutionCycle({ elapsedMinutes: 10_000 }) })],
	});

	assert.deepEqual(result.sent, []);
	assert.equal(result.saved, null);
	assert.ok(result.output.directMessageCount > 0);
	assert.equal(result.output.notified, false);
	const observable = JSON.stringify({ logs: result.logs, attributes: result.attributes, output: result.output });
	for (const secret of ['SYNTHETIC-1', 'Synthetic Developer', 'Synthetic summary', DEV, LEAD]) {
		assert.ok(!observable.includes(secret), `dry-run output must not contain ${secret}`);
	}
});

test('escalates a crossed level once and records it', async () => {
	// The synthetic ticket is High priority: L2 falls due at 8 working hours.
	const tickets = [ticket({ resolutionSla: resolutionCycle({ elapsedMinutes: 8 * 60 }) })];
	const first = await run({ config: config({ bot: true }), tickets });

	assert.equal(first.output.escalationCount, 1);
	assert.deepEqual(first.saved, { 'SYNTHETIC-1': 2 });
	assert.ok(first.sent.some((message) => message.entraObjectId === LEAD));
	assert.match(
		first.sent.find((message) => message.entraObjectId === LEAD)?.text ?? '',
		/Эскалаци — L2/,
	);

	const second = await run({ config: config({ bot: true }), tickets, state: first.saved ?? {} });
	assert.equal(second.output.escalationCount, 0);
	assert.deepEqual(second.sent.map((message) => message.entraObjectId), [DEV]);
});

test('fails the run visibly when a recipient cannot be reached, without naming them', async () => {
	const logs: string[] = [];
	await assert.rejects(
		run({
			config: config({ bot: true }),
			failSend: () => new TeamsDeliveryError('not-installed', 'bot is not installed'),
			post: async (message) => {
				logs.push(message);
			},
		}),
		/1 of 1 direct-message recipient\(s\) failed/,
	);
});

test('fails visibly when no ticket carries the escalation clock', async () => {
	await assert.rejects(
		run({ config: config({ bot: true }), tickets: [ticket({ resolutionSla: null })] }),
		/drives the escalation clock but was not found on any of 1 Jira tickets/,
	);
});

test('the staged rollout gate keeps escalation out of everyone else\'s chat', async () => {
	const result = await run({
		config: config({ bot: true, allowlist: [DEV] }),
		// High priority: L2 falls due at 8 working hours, and L2 is the lead.
		tickets: [ticket({ resolutionSla: resolutionCycle({ elapsedMinutes: 8 * 60 }) })],
	});

	assert.deepEqual(result.sent.map((message) => message.entraObjectId), [DEV]);
	assert.deepEqual(result.saved, {});
	assert.match(result.logs.join('\n'), /Staged rollout withheld 1 recipient/);
});

test('seeds escalation state without notifying anyone', async () => {
	const result = await run({
		config: config({ bot: true, seedOnly: true }),
		// High priority: L4 falls due at 25 working hours.
		tickets: [ticket({ resolutionSla: resolutionCycle({ elapsedMinutes: 25 * 60 }) })],
	});

	assert.deepEqual(result.sent, []);
	assert.deepEqual(result.saved, { 'SYNTHETIC-1': 4 });
	assert.equal(result.output.escalationCount, 1);
	assert.equal(result.output.directMessageCount, 0);
});

test('refuses to seed state during a dry run', async () => {
	await assert.rejects(
		run({ config: config({ bot: true, seedOnly: true, dryRun: true }) }),
		/cannot run with REMINDER_DRY_RUN/,
	);
});

interface RunOptions {
	tickets?: JiraTicket[];
	config?: AppConfig;
	generateIntro?: (input: string, signal: AbortSignal) => Promise<string>;
	buildMessages?: () => string[];
	post?: (message: string) => Promise<void>;
	escalationConfig?: EscalationConfig;
	state?: EscalationState;
	failSend?: (message: DirectMessage) => Error | null;
}

async function run(options: RunOptions = {}) {
	const logs: string[] = [];
	const attributes: Record<string, unknown>[] = [];
	const sent: DirectMessage[] = [];
	let saved: EscalationState | null = null;
	const tickets = options.tickets ?? [ticket()];
	const output = await runJiraTeamsReminder({
		config: options.config ?? config(),
		now: NOW,
		generateIntro: options.generateIntro,
		log: {
			info: (message, attrs) => {
				logs.push(message);
				if (attrs) attributes.push(attrs);
			},
			warn: (message, attrs) => {
				logs.push(message);
				if (attrs) attributes.push(attrs);
			},
		},
		dependencies: {
			fetchTickets: async (): Promise<JiraFetchResult> => ({
				tickets,
				scanned: tickets.length,
				withoutSla: 0,
				withoutResolutionSla: tickets.filter((value) => value.resolutionSla === null).length,
				truncated: false,
			}),
			...(options.buildMessages ? { buildReminderMessages: options.buildMessages } : {}),
			postToChannel: async (message) => options.post?.(message),
			loadEscalationConfig: async () => options.escalationConfig ?? directory(),
			readEscalationState: async () => options.state ?? {},
			writeEscalationState: async (_path, value) => {
				saved = { ...value };
			},
			createBotSender: async () => ({
				send: async (message) => {
					const failure = options.failSend?.(message);
					if (failure) throw failure;
					sent.push(message);
				},
			}),
		},
	});
	return { logs, attributes, output, sent, saved };
}

const DEV = '11111111-1111-4111-8111-111111111111';
const LEAD = '22222222-2222-4222-8222-222222222222';

function directory(): EscalationConfig {
	return {
		people: {
			dev: { name: 'Synthetic Developer', entraObjectId: DEV, jiraAccountId: 'synthetic-account' },
			lead: { name: 'Synthetic Lead', entraObjectId: LEAD, jiraAccountId: 'synthetic-lead' },
		},
		projects: { SYNTHETIC: { L2: 'lead', L3: 'lead', L4: 'lead', L5: 'lead' } },
	};
}

function resolutionCycle(overrides: Partial<SlaCycle> = {}): SlaCycle {
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

function config(
	overrides: {
		dryRun?: boolean;
		useLlmIntro?: boolean;
		timeoutMs?: number;
		bot?: boolean;
		webhook?: boolean;
		seedOnly?: boolean;
		allowlist?: string[] | null;
	} = {},
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
			resolutionSlaName: 'Time to resolution',
			http,
		},
		teamsWebhookUrl: overrides.webhook === false ? null : 'https://teams.invalid/webhook',
		bot: overrides.bot
			? {
				appId: '11111111-2222-3333-4444-555555555555',
				tenantId: '99999999-8888-7777-6666-555555555555',
				appPassword: 'synthetic-secret',
				appExternalId: '11111111-2222-3333-4444-555555555555',
				graphClientId: '11111111-2222-3333-4444-555555555555',
				graphClientSecret: 'synthetic-secret',
				serviceUrl: 'https://smba.invalid/teams',
				recipientAllowlist: overrides.allowlist ?? null,
				http,
			}
			: null,
		escalation: {
			configFile: 'tests/fixtures/escalation.json',
			stateFile: 'tests/fixtures/state.json',
		},
		reminder: {
			repeatMinutes: 60,
			deliveryWindowMinutes: 15,
			useLlmIntro: overrides.useLlmIntro ?? false,
			introTimeoutMs: overrides.timeoutMs ?? 1_000,
			dryRun: overrides.dryRun ?? false,
			maxMessageChars: 12_000,
			escalationSeedOnly: overrides.seedOnly ?? false,
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
		assigneeAccountId: 'synthetic-account',
		url: 'https://jira.invalid/browse/SYNTHETIC-1',
		firstResponseSla: {
			name: 'First response',
			state: 'ongoing',
			breached: true,
			paused: false,
			withinCalendarHours: true,
			breachTimeEpochMillis: NOW.getTime() - 60 * 60_000,
			elapsedMinutes: 60,
		},
		resolutionSla: resolutionCycle(),
		...overrides,
	};
}
