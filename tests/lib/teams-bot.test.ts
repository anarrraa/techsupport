import assert from 'node:assert/strict';
import test from 'node:test';
import type { TeamsBotConfig } from '../../src/lib/config.ts';
import { createBotSender, TeamsDeliveryError } from '../../src/lib/teams-bot.ts';

const APP_ID = '11111111-2222-3333-4444-555555555555';
const TENANT_ID = '99999999-8888-7777-6666-555555555555';
const RECIPIENT = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const CATALOG_ID = 'catalog-app-1';
const CHAT_ID = '19:personal-chat-1';

interface Recorded {
	method: string;
	url: string;
	body: string;
	headers: Record<string, string>;
}

interface Overrides {
	installed?: boolean;
	catalog?: Array<{ id: string; distributionMethod?: string }>;
	graphStatus?: number;
	activity?: { status: number; body: string };
}

test('installs the app for the recipient, then posts one activity into their chat', async () => {
	const calls: Recorded[] = [];
	const sender = await createBotSender(config(), {}, fakeFetch(calls));
	await sender.send({ entraObjectId: RECIPIENT, text: 'Сануулга' });

	assert.deepEqual(
		calls.map((call) => `${call.method} ${call.url.replace('https://graph.microsoft.com/v1.0', '')}`),
		[
			`POST https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
			`POST https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
			`GET /appCatalogs/teamsApps?$filter=externalId%20eq%20'${APP_ID}'&$select=id,distributionMethod`,
			`GET /users/${RECIPIENT}/teamwork/installedApps?$expand=teamsApp&$filter=teamsApp%2Fid%20eq%20'${CATALOG_ID}'`,
			`POST /users/${RECIPIENT}/teamwork/installedApps`,
			`GET /users/${RECIPIENT}/teamwork/installedApps/install-1/chat`,
			'POST https://smba.invalid/teams/v3/conversations/19%3Apersonal-chat-1/activities',
		],
	);

	const [botToken, graphToken] = calls as [Recorded, Recorded];
	assert.equal(
		new URLSearchParams(botToken.body).get('scope'),
		'https://api.botframework.com/.default',
	);
	assert.equal(
		new URLSearchParams(graphToken.body).get('scope'),
		'https://graph.microsoft.com/.default',
	);

	const install = calls[4] as Recorded;
	assert.deepEqual(JSON.parse(install.body), {
		'teamsApp@odata.bind': `https://graph.microsoft.com/v1.0/appCatalogs/teamsApps/${CATALOG_ID}`,
	});

	const activity = calls[6] as Recorded;
	assert.deepEqual(JSON.parse(activity.body), {
		type: 'message',
		textFormat: 'markdown',
		text: 'Сануулга',
	});
});

test('skips the install when the recipient already has the app', async () => {
	const calls: Recorded[] = [];
	const sender = await createBotSender(config(), {}, fakeFetch(calls, { installed: true }));
	await sender.send({ entraObjectId: RECIPIENT, text: 'Сануулга' });

	assert.equal(calls.filter((call) => call.method === 'POST' && call.url.endsWith('installedApps')).length, 0);
	assert.ok(calls.some((call) => call.url.endsWith('/activities')));
});

test('resolves each recipient chat once however many messages they get', async () => {
	const calls: Recorded[] = [];
	const sender = await createBotSender(config(), {}, fakeFetch(calls, { installed: true }));
	await sender.send({ entraObjectId: RECIPIENT, text: 'first' });
	await sender.send({ entraObjectId: RECIPIENT, text: 'second' });

	assert.equal(calls.filter((call) => call.url.includes('graph.microsoft.com')).length, 3);
	assert.equal(calls.filter((call) => call.url.endsWith('/activities')).length, 2);
});

test('exchanges a GitHub OIDC token for both scopes when no secret is configured', async () => {
	const calls: Recorded[] = [];
	const sender = await createBotSender(
		{ ...config(), appPassword: null, graphClientSecret: null },
		{
			ACTIONS_ID_TOKEN_REQUEST_URL: 'https://actions.invalid/token?api-version=2',
			ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'runner-token',
		},
		fakeFetch(calls, { installed: true }),
	);
	await sender.send({ entraObjectId: RECIPIENT, text: 'Сануулга' });

	const oidc = calls.filter((call) => call.url.startsWith('https://actions.invalid/'));
	assert.equal(oidc.length, 2);
	assert.equal(
		oidc[0]?.url,
		'https://actions.invalid/token?api-version=2&audience=api%3A%2F%2FAzureADTokenExchange',
	);
	assert.equal(oidc[0]?.headers.authorization, 'Bearer runner-token');
	for (const token of calls.filter((call) => call.url.includes('/oauth2/v2.0/token'))) {
		const body = new URLSearchParams(token.body);
		assert.equal(body.get('client_secret'), null);
		assert.equal(body.get('client_assertion'), 'github-oidc-token');
	}
});

test('refuses to run without either credential', async () => {
	await assert.rejects(
		createBotSender({ ...config(), appPassword: null, graphClientSecret: null }, {}, fakeFetch([])),
		/GitHub OIDC is unavailable/,
	);
});

test('prefers the published catalog entry over a sideloaded duplicate', async () => {
	const calls: Recorded[] = [];
	const sender = await createBotSender(
		config(),
		{},
		fakeFetch(calls, {
			installed: true,
			// Graph returns the sideloaded copy first; the published one must win.
			catalog: [
				{ id: 'sideloaded-copy', distributionMethod: 'sideloaded' },
				{ id: CATALOG_ID, distributionMethod: 'organization' },
			],
		}),
	);
	await sender.send({ entraObjectId: RECIPIENT, text: 'x' });
	assert.ok(
		calls.some((call) => call.url.includes(`teamsApp%2Fid%20eq%20'${CATALOG_ID}'`)),
		'the installed-apps lookup must use the published catalog id',
	);
});

test('a sideloaded-only catalog entry is still usable, and outranks an unknown method', async () => {
	// Sideloading during a pilot is the only entry that exists until an
	// administrator publishes, so it has to work on its own.
	const calls: Recorded[] = [];
	const sender = await createBotSender(
		config(),
		{},
		fakeFetch(calls, {
			installed: true,
			catalog: [{ id: 'unknown-method' }, { id: CATALOG_ID, distributionMethod: 'sideloaded' }],
		}),
	);
	await sender.send({ entraObjectId: RECIPIENT, text: 'x' });
	assert.ok(
		calls.some((call) => call.url.includes(`teamsApp%2Fid%20eq%20'${CATALOG_ID}'`)),
		'a known distribution method must outrank one Graph did not report',
	);
});

test('says so when the app is not in the organisation catalog', async () => {
	const sender = await createBotSender(config(), {}, fakeFetch([], { catalog: [] }));
	const error = await failureOf(sender.send({ entraObjectId: RECIPIENT, text: 'x' }));
	assert.ok(error instanceof TeamsDeliveryError);
	assert.equal(error.reason, 'not-in-catalog');
	assert.match(error.message, /administrator has to publish the app package/);
});

test('names the missing Graph consent when installation is refused', async () => {
	const sender = await createBotSender(config(), {}, fakeFetch([], { graphStatus: 403 }));
	const error = await failureOf(sender.send({ entraObjectId: RECIPIENT, text: 'x' }));
	assert.ok(error instanceof TeamsDeliveryError);
	assert.equal(error.reason, 'install-forbidden');
	assert.match(error.message, /TeamsAppInstallation\.ReadWriteForUser\.All/);
});

test('tells a missing app installation apart from blocked writes', async () => {
	for (const [body, reason] of [
		['{"error":{"code":"ForbiddenOperationException"}}', 'not-installed'],
		['{"error":{"code":"MessageWritesBlocked"}}', 'writes-blocked'],
		['{"error":{"code":"SomethingElse"}}', 'other'],
	] as const) {
		const sender = await createBotSender(
			config(),
			{},
			fakeFetch([], { installed: true, activity: { status: 403, body } }),
		);
		const error = await failureOf(sender.send({ entraObjectId: RECIPIENT, text: 'x' }));
		assert.ok(error instanceof TeamsDeliveryError, `${reason} should be a delivery error`);
		assert.equal(error.reason, reason);
	}
});

function failureOf(promise: Promise<unknown>): Promise<unknown> {
	return promise.then(() => null, (error: unknown) => error);
}

function config(): TeamsBotConfig {
	return {
		appId: APP_ID,
		tenantId: TENANT_ID,
		appPassword: 'synthetic-secret',
		appExternalId: APP_ID,
		graphClientId: APP_ID,
		graphClientSecret: 'synthetic-secret',
		serviceUrl: 'https://smba.invalid/teams',
		recipientAllowlist: null,
		http: { timeoutMs: 1_000, maxRetries: 0 },
	};
}

function fakeFetch(calls: Recorded[], overrides: Overrides = {}): typeof fetch {
	const catalog = overrides.catalog ?? [{ id: CATALOG_ID, distributionMethod: 'organization' }];
	return (async (input: string | URL | Request, init?: RequestInit) => {
		const url = String(input);
		calls.push({
			method: init?.method ?? 'GET',
			url,
			body: typeof init?.body === 'string' ? init.body : '',
			headers: normalizeHeaders(init?.headers),
		});

		if (url.startsWith('https://actions.invalid/')) return json({ value: 'github-oidc-token' });
		if (url.includes('/oauth2/v2.0/token')) return json({ access_token: 'synthetic-token' });

		if (url.includes('/appCatalogs/teamsApps?')) return json({ value: catalog });
		if (url.includes('graph.microsoft.com')) {
			if (overrides.graphStatus) {
				return new Response('{"error":{"code":"Authorization_RequestDenied"}}', {
					status: overrides.graphStatus,
					statusText: 'Forbidden',
				});
			}
			if (url.endsWith('/chat')) return json({ id: CHAT_ID });
			if (url.includes('installedApps?')) {
				return json({ value: overrides.installed ? [{ id: 'install-1' }] : [] });
			}
			if (url.endsWith('/installedApps')) return json({ id: 'install-1' });
		}

		if (url.endsWith('/activities')) {
			const failure = overrides.activity;
			if (failure) {
				return new Response(failure.body, { status: failure.status, statusText: 'Forbidden' });
			}
			return json({ id: 'activity-1' });
		}
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
