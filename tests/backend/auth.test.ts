import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { spawnSync } from 'node:child_process';
import { generateKeyPair, SignJWT } from 'jose';
import { assertExposure, authConfig, finishLogin, readSession, signCookie, startLogin, verifyCookie, type AuthConfig, type LoginDeps } from '../../src/backend/auth.ts';
import { createApp } from '../../src/backend/server.ts';

// Synthetic values only: no real tenant, app, or group.
const config: AuthConfig = {
	tenantId: 'tenant-test', clientId: 'client-test', clientSecret: 'secret-test',
	allowedGroupId: 'group-allowed', sessionSecret: 'x'.repeat(32), publicUrl: 'https://app.example.test',
};
const ENV = {
	ENTRA_TENANT_ID: config.tenantId, ENTRA_CLIENT_ID: config.clientId, ENTRA_CLIENT_SECRET: config.clientSecret,
	ENTRA_ALLOWED_GROUP_ID: config.allowedGroupId, SESSION_SECRET: config.sessionSecret, PUBLIC_URL: config.publicUrl,
};
const NOW = Date.parse('2026-11-07T00:00:00Z');
const { privateKey, publicKey } = await generateKeyPair('RS256');

function idToken(claims: Record<string, unknown>, overrides: { issuer?: string; audience?: string; expires?: number } = {}) {
	return new SignJWT(claims).setProtectedHeader({ alg: 'RS256' })
		.setIssuer(overrides.issuer ?? `https://login.microsoftonline.com/${config.tenantId}/v2.0`)
		.setAudience(overrides.audience ?? config.clientId)
		.setIssuedAt(NOW / 1000).setExpirationTime(overrides.expires ?? NOW / 1000 + 3600)
		.sign(privateKey);
}

/** The token is signed only when the endpoint is called, so it can use the nonce of the login it belongs to. */
const later = (make: () => Promise<string>) => new Promise<string>((resolve) => setImmediate(() => resolve(make())));

/** A login started now, plus deps whose token endpoint returns `token` and records what was sent. */
function login(token: Promise<string> | string) {
	const started = startLogin(config, NOW);
	const state = new URL(started.url).searchParams.get('state')!;
	const nonce = verifyCookie<{ nonce: string }>(config.sessionSecret, started.cookie.split(';')[0].split('=')[1], NOW)!.nonce;
	const sent: URLSearchParams[] = [];
	const deps: LoginDeps = {
		fetch: (async (_url, init) => {
			sent.push(init!.body as URLSearchParams);
			return Response.json({ id_token: await token });
		}) as typeof fetch,
		keys: async () => publicKey,
		now: NOW,
	};
	return { started, state, nonce, cookie: started.cookie.split(';')[0].split('=')[1], deps, sent };
}

test('auth config: none set is dev mode, partial or weak config fails naming the variables', () => {
	assert.equal(authConfig({}), null);
	assert.deepEqual(authConfig(ENV), config);
	assert.throws(() => authConfig({ ENTRA_TENANT_ID: 't' }), /missing ENTRA_CLIENT_ID, ENTRA_CLIENT_SECRET, ENTRA_ALLOWED_GROUP_ID, SESSION_SECRET, PUBLIC_URL/);
	assert.throws(() => authConfig({ ...ENV, SESSION_SECRET: 'short' }), /SESSION_SECRET/);
	assert.throws(() => authConfig({ ...ENV, PUBLIC_URL: 'http://app.example.test' }), /PUBLIC_URL/);
});

test('without auth the server may only listen on loopback', () => {
	for (const host of ['127.0.0.1', 'localhost', '::1']) assert.doesNotThrow(() => assertExposure(host, null));
	for (const host of ['0.0.0.0', '::', '10.0.0.5']) assert.throws(() => assertExposure(host, null), /Refusing to listen/);
	assert.doesNotThrow(() => assertExposure('0.0.0.0', config));
});

test('the server process exits non-zero on 0.0.0.0 without auth env', () => {
	const run = spawnSync(process.execPath, ['src/backend/server.ts'], {
		env: { PATH: process.env.PATH, BACKEND_HOST: '0.0.0.0', BACKEND_PORT: '0' }, encoding: 'utf8', timeout: 20_000,
	});
	assert.notEqual(run.status, 0);
	assert.match(run.stderr, /Refusing to listen on 0\.0\.0\.0 without auth/);
});

test('signed cookies reject tampering and expiry', () => {
	const value = signCookie(config.sessionSecret, { name: 'A' }, 60, NOW);
	assert.equal(verifyCookie<{ name: string }>(config.sessionSecret, value, NOW)?.name, 'A');
	const [payload, mac] = value.split('.');
	const forged = Buffer.from(JSON.stringify({ name: 'B', exp: NOW / 1000 + 60 })).toString('base64url');
	assert.equal(verifyCookie(config.sessionSecret, `${forged}.${mac}`, NOW), null);
	assert.equal(verifyCookie(config.sessionSecret, `${payload}.${mac}x`, NOW), null);
	assert.equal(verifyCookie('y'.repeat(32), value, NOW), null);
	assert.equal(verifyCookie(config.sessionSecret, value, NOW + 61_000), null);
	assert.equal(verifyCookie(config.sessionSecret, 'garbage', NOW), null);
});

test('login uses PKCE S256, a random state and nonce, and a short HttpOnly Secure cookie', () => {
	const { started } = login('');
	const url = new URL(started.url);
	assert.equal(url.origin + url.pathname, `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/authorize`);
	assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
	assert.equal(url.searchParams.get('redirect_uri'), `${config.publicUrl}/api/auth/callback`);
	assert.ok(url.searchParams.get('code_challenge') && url.searchParams.get('nonce') && url.searchParams.get('state'));
	assert.match(started.cookie, /^login=[^;]+; Max-Age=600; Path=\/; HttpOnly; Secure; SameSite=Lax$/);
	assert.notEqual(new URL(startLogin(config, NOW).url).searchParams.get('state'), url.searchParams.get('state'));
});

test('a group member gets an 8-hour session; the code is redeemed with the PKCE verifier', async () => {
	const flow = login(later(() => idToken({ name: 'Staff One', nonce: flow.nonce, groups: ['other', config.allowedGroupId] })));
	const session = await finishLogin(config, { code: 'c', state: flow.state }, flow.cookie, flow.deps);
	assert.equal(session.name, 'Staff One');
	assert.match(session.cookie, /^session=[^;]+; Max-Age=28800; Path=\/; HttpOnly; Secure; SameSite=Lax$/);
	assert.equal(flow.sent[0].get('code_verifier')?.length, 43);
	assert.equal(flow.sent[0].get('grant_type'), 'authorization_code');
	assert.deepEqual(readSession(config, session.cookie.split(';')[0], NOW), { name: 'Staff One' });
	assert.equal(readSession(config, session.cookie.split(';')[0], NOW + 28_801_000), null);
});

test('wrong group, missing groups (overage), bad nonce, issuer, audience, expiry and state are refused', async () => {
	const cases: [Record<string, unknown> | null, Parameters<typeof idToken>[1], number, string?][] = [
		[{ groups: ['other'] }, {}, 403],
		[{ _claim_names: { groups: 'src1' } }, {}, 403],
		[{ groups: [config.allowedGroupId], nonce: 'wrong' }, {}, 401],
		[{ groups: [config.allowedGroupId] }, { issuer: 'https://login.microsoftonline.com/other/v2.0' }, 401],
		[{ groups: [config.allowedGroupId] }, { audience: 'other-app' }, 401],
		[{ groups: [config.allowedGroupId] }, { expires: NOW / 1000 - 600 }, 401],
		[{ groups: [config.allowedGroupId] }, {}, 400, 'bad-state'],
	];
	for (const [claims, overrides, status, state] of cases) {
		const flow = login(later(() => idToken({ nonce: flow.nonce, ...claims }, overrides)));
		await assert.rejects(finishLogin(config, { code: 'c', state: state ?? flow.state }, flow.cookie, flow.deps),
			(error: { status?: number }) => error.status === status, JSON.stringify(claims));
	}
});

async function withServer(app: ReturnType<typeof createApp>, run: (url: string) => Promise<void>) {
	const server = app.listen(0, '127.0.0.1');
	try {
		await once(server, 'listening');
		const address = server.address();
		assert.ok(address && typeof address !== 'string');
		await run(`http://127.0.0.1:${address.port}`);
	} finally {
		server.closeAllConnections();
		await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
	}
}

const store = { check: async () => {}, read: async () => [] };

test('with auth on, /api needs a session: none, tampered or expired → 401; health stays open', async () => {
	await withServer(createApp(store, async () => ({}), undefined, config), async (url) => {
		for (const path of ['/health', '/api/health']) assert.equal((await fetch(`${url}${path}`)).status, 200);
		const valid = `session=${signCookie(config.sessionSecret, { name: 'Staff One' }, 60)}`;
		const expired = `session=${signCookie(config.sessionSecret, { name: 'Staff One' }, -1)}`;
		for (const cookie of [undefined, `${valid}x`, expired]) {
			const response = await fetch(`${url}/api/reports/2026-10`, { headers: cookie ? { cookie } : {} });
			assert.deepEqual([response.status, await response.json()], [401, { error: 'Sign in required' }]);
		}
		assert.equal((await fetch(`${url}/api/chat`, { method: 'POST' })).status, 401);
		assert.equal((await fetch(`${url}/api/reports/2026-10`, { headers: { cookie: valid } })).status, 200);
		assert.deepEqual(await (await fetch(`${url}/api/auth/me`, { headers: { cookie: valid } })).json(), { name: 'Staff One' });
	});
});

test('the HTTP callback answers 403 for a user outside the group and sets no session', async () => {
	const flow = login(later(() => idToken({ nonce: flow.nonce, groups: ['other'] })));
	await withServer(createApp(store, async () => ({}), undefined, config, flow.deps), async (url) => {
		const response = await fetch(`${url}/api/auth/callback?code=c&state=${flow.state}`, { headers: { cookie: `login=${flow.cookie}` }, redirect: 'manual' });
		assert.equal(response.status, 403);
		assert.equal(response.headers.get('set-cookie'), null);
	});
});

test('login redirects to Entra; callback sets the session and logout clears it', async () => {
	const flow = login(later(() => idToken({ name: 'Staff One', nonce: flow.nonce, groups: [config.allowedGroupId] })));
	await withServer(createApp(store, async () => ({}), undefined, config, flow.deps), async (url) => {
		const start = await fetch(`${url}/api/auth/login`, { redirect: 'manual' });
		assert.equal(start.status, 302);
		assert.match(start.headers.get('location')!, /^https:\/\/login\.microsoftonline\.com\/tenant-test\/oauth2\/v2\.0\/authorize\?/);
		const done = await fetch(`${url}/api/auth/callback?code=c&state=${flow.state}`, { headers: { cookie: `login=${flow.cookie}` }, redirect: 'manual' });
		assert.equal(done.status, 302);
		assert.equal(done.headers.get('location'), '/');
		assert.match(done.headers.getSetCookie()[0], /^session=/);
		const out = await fetch(`${url}/api/auth/logout`, { redirect: 'manual' });
		assert.match(out.headers.get('set-cookie')!, /^session=; Max-Age=0/);
		assert.match(out.headers.get('location')!, /\/oauth2\/v2\.0\/logout\?post_logout_redirect_uri=https%3A%2F%2Fapp\.example\.test$/);
	});
});

test('without auth config the app behaves as before: no login routes, API open on loopback', async () => {
	await withServer(createApp(store, async () => ({})), async (url) => {
		assert.equal((await fetch(`${url}/api/reports/2026-10`)).status, 200);
		assert.equal((await fetch(`${url}/api/auth/login`, { redirect: 'manual' })).status, 404);
	});
});
