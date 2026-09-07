import assert from 'node:assert/strict';
import test from 'node:test';
import type { TeamsBotConfig } from '../../src/lib/config.ts';
import { createBotSender, TeamsDeliveryError } from '../../src/lib/teams-bot.ts';

const APP_ID = '11111111-2222-3333-4444-555555555555';
const TENANT_ID = '99999999-8888-7777-6666-555555555555';
const RECIPIENT = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

interface Recorded {
	url: string;
	body: string;
	headers: Record<string, string>;
}

test('sends a proactive one-to-one message through the Bot Connector', async () => {
	const calls: Recorded[] = [];
	const sender = await createBotSender(config(), {}, fakeFetch(calls));
	await sender.send({ entraObjectId: RECIPIENT, text: 'Сануулга' });

	const [token, conversation, activity] = calls as [Recorded, Recorded, Recorded];
	assert.equal(
		token.url,
		`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
	);
	const tokenBody = new URLSearchParams(token.body);
	assert.equal(tokenBody.get('grant_type'), 'client_credentials');
	assert.equal(tokenBody.get('client_id'), APP_ID);
	assert.equal(tokenBody.get('client_secret'), 'synthetic-secret');
	assert.equal(tokenBody.get('scope'), 'https://api.botframework.com/.default');

	assert.equal(conversation.url, 'https://smba.invalid/teams/v3/conversations');
	assert.equal(conversation.headers.authorization, 'Bearer synthetic-token');
	assert.deepEqual(JSON.parse(conversation.body), {
		bot: { id: `28:${APP_ID}` },
		members: [{ id: RECIPIENT }],
		channelData: { tenant: { id: TENANT_ID } },
		isGroup: false,
		tenantId: TENANT_ID,
	});

	assert.equal(activity.url, 'https://smba.invalid/teams/v3/conversations/a%3Aconv-1/activities');
	assert.deepEqual(JSON.parse(activity.body), {
		type: 'message',
		textFormat: 'markdown',
		text: 'Сануулга',
	});
});

test('exchanges a GitHub OIDC token when no client secret is configured', async () => {
	const calls: Recorded[] = [];
	const sender = await createBotSender(
		{ ...config(), appPassword: null },
		{
			ACTIONS_ID_TOKEN_REQUEST_URL: 'https://actions.invalid/token?api-version=2',
			ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'runner-token',
		},
		fakeFetch(calls),
	);
	await sender.send({ entraObjectId: RECIPIENT, text: 'Сануулга' });

	const [oidc, token] = calls as [Recorded, Recorded];
	assert.equal(oidc.url, 'https://actions.invalid/token?api-version=2&audience=api%3A%2F%2FAzureADTokenExchange');
	assert.equal(oidc.headers.authorization, 'Bearer runner-token');
	const tokenBody = new URLSearchParams(token.body);
	assert.equal(tokenBody.get('client_secret'), null);
	assert.equal(
		tokenBody.get('client_assertion_type'),
		'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
	);
	assert.equal(tokenBody.get('client_assertion'), 'github-oidc-token');
});

test('refuses to run without either credential', async () => {
	await assert.rejects(
		createBotSender({ ...config(), appPassword: null }, {}, fakeFetch([])),
		/GitHub OIDC is unavailable/,
	);
});

test('tells a missing app installation apart from blocked writes', async () => {
	for (const [body, reason] of [
		['{"error":{"code":"ForbiddenOperationException"}}', 'not-installed'],
		['{"error":{"code":"MessageWritesBlocked"}}', 'writes-blocked'],
		['{"error":{"code":"SomethingElse"}}', 'other'],
	] as const) {
		const sender = await createBotSender(config(), {}, fakeFetch([], { conversation: { status: 403, body } }));
		const error = await sender
			.send({ entraObjectId: RECIPIENT, text: 'Сануулга' })
			.then(() => null, (caught: unknown) => caught);
		assert.ok(error instanceof TeamsDeliveryError, `${reason} should be a delivery error`);
		assert.equal(error.reason, reason);
	}
});

function config(): TeamsBotConfig {
	return {
		appId: APP_ID,
		tenantId: TENANT_ID,
		appPassword: 'synthetic-secret',
		serviceUrl: 'https://smba.invalid/teams/',
		http: { timeoutMs: 1_000, maxRetries: 0 },
	};
}

function fakeFetch(
	calls: Recorded[],
	failures: { conversation?: { status: number; body: string } } = {},
): typeof fetch {
	return (async (input: string | URL | Request, init?: RequestInit) => {
		const url = String(input);
		calls.push({
			url,
			body: typeof init?.body === 'string' ? init.body : '',
			headers: normalizeHeaders(init?.headers),
		});
		if (url.startsWith('https://actions.invalid/')) return json({ value: 'github-oidc-token' });
		if (url.includes('/oauth2/v2.0/token')) return json({ access_token: 'synthetic-token' });
		if (url.endsWith('/v3/conversations')) {
			const failure = failures.conversation;
			if (failure) {
				return new Response(failure.body, { status: failure.status, statusText: 'Forbidden' });
			}
			return json({ id: 'a:conv-1' });
		}
		if (url.endsWith('/activities')) return json({ id: 'activity-1' });
		throw new Error(`Unexpected request to ${url}`);
	}) as typeof fetch;
}

function normalizeHeaders(headers: RequestInit['headers']): Record<string, string> {
	const result: Record<string, string> = {};
	for (const [key, value] of Object.entries((headers ?? {}) as Record<string, string>)) {
		result[key.toLowerCase()] = value;
	}
	return result;
}

function json(value: unknown): Response {
	return new Response(JSON.stringify(value), {
		status: 200,
		headers: { 'Content-Type': 'application/json' },
	});
}
