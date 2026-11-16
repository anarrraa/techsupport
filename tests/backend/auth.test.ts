import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKeyPair, SignJWT } from 'jose';
import { assertExposure, authConfig, finishLogin, readSession, signCookie, startLogin, verifyCookie, type AuthConfig, type LoginDeps } from '../../src/backend/auth.ts';
import { createApp, listenPort } from '../../src/backend/server.ts';

// Synthetic values only: no real tenant, app, or person.
const config: AuthConfig = {
	tenantId: '00000000-0000-4000-8000-000000000001', clientId: 'client-test', clientSecret: 'secret-test',
	superadminEmail: 'admin@example.test', sessionSecret: 'x'.repeat(32), publicUrl: 'https://app.example.test',
};
const ENV = {
	ENTRA_TENANT_ID: config.tenantId, ENTRA_CLIENT_ID: config.clientId, ENTRA_CLIENT_SECRET: config.clientSecret,
	SUPERADMIN_EMAIL: 'Admin@Example.test ', SESSION_SECRET: config.sessionSecret, PUBLIC_URL: config.publicUrl,
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
	assert.throws(() => authConfig({ ENTRA_TENANT_ID: 't' }), /missing ENTRA_CLIENT_ID, ENTRA_CLIENT_SECRET, SUPERADMIN_EMAIL, SESSION_SECRET, PUBLIC_URL/);
	assert.throws(() => authConfig({ ...ENV, SESSION_SECRET: 'short' }), /SESSION_SECRET/);
	assert.throws(() => authConfig({ ...ENV, SUPERADMIN_EMAIL: 'admin' }), /SUPERADMIN_EMAIL/);
	assert.throws(() => authConfig({ ...ENV, PUBLIC_URL: 'http://app.example.test' }), /PUBLIC_URL/);
	for (const tenant of ['contoso.onmicrosoft.com', 'common', 'organizations']) {
		assert.throws(() => authConfig({ ...ENV, ENTRA_TENANT_ID: tenant }), /ENTRA_TENANT_ID must be the tenant GUID/);
	}
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

test('a staff sign-in gets an 8-hour session carrying the lowercased email; the code is redeemed with the PKCE verifier', async () => {
	const flow = login(later(() => idToken({ name: 'Staff One', nonce: flow.nonce, preferred_username: 'Staff.One@Example.test' })));
	const session = await finishLogin(config, { code: 'c', state: flow.state }, flow.cookie, flow.deps);
	assert.equal(session.name, 'Staff One');
	assert.match(session.cookie, /^session=[^;]+; Max-Age=28800; Path=\/; HttpOnly; Secure; SameSite=Lax$/);
	assert.equal(flow.sent[0].get('code_verifier')?.length, 43);
	assert.equal(flow.sent[0].get('grant_type'), 'authorization_code');
	assert.deepEqual(readSession(config, session.cookie.split(';')[0], NOW), { name: 'Staff One', email: 'staff.one@example.test' });
	assert.equal(session.email, 'staff.one@example.test');
	assert.equal(readSession(config, session.cookie.split(';')[0], NOW + 28_801_000), null);
});

test('no email, bad nonce, issuer, audience, expiry and state are refused', async () => {
	const cases: [Record<string, unknown> | null, Parameters<typeof idToken>[1], number, string?][] = [
		[{}, {}, 403],
		[{ preferred_username: 'not-an-email' }, {}, 403],
		[{ preferred_username: 'staff@example.test', nonce: 'wrong' }, {}, 401],
		[{ preferred_username: 'staff@example.test' }, { issuer: 'https://login.microsoftonline.com/other/v2.0' }, 401],
		[{ preferred_username: 'staff@example.test' }, { audience: 'other-app' }, 401],
		[{ preferred_username: 'staff@example.test' }, { expires: NOW / 1000 - 600 }, 401],
		[{ preferred_username: 'staff@example.test' }, {}, 400, 'bad-state'],
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

/** In-memory team; starts with one member. */
function team(...emails: string[]) {
	const set = new Set(emails.length ? emails : ['staff@example.test']);
	return {
		set,
		has: async (email: string) => set.has(email),
		list: async () => [...set].sort(),
		add: async (email: string) => { set.add(email); },
		remove: async (email: string) => { set.delete(email); },
	};
}
const sessionFor = (email: string, seconds = 60) => `session=${signCookie(config.sessionSecret, { typ: 'session', name: 'Staff One', email }, seconds)}`;

test('with auth on, /api needs a session: none, tampered or expired → 401; health stays open', async () => {
	await withServer(createApp(store, async () => ({}), undefined, config, undefined, undefined, team()), async (url) => {
		for (const path of ['/health', '/api/health']) assert.equal((await fetch(`${url}${path}`)).status, 200);
		const valid = sessionFor('staff@example.test');
		const expired = sessionFor('staff@example.test', -1);
		for (const cookie of [undefined, `${valid}x`, expired]) {
			const response = await fetch(`${url}/api/reports/2026-10`, { headers: cookie ? { cookie } : {} });
			assert.deepEqual([response.status, await response.json()], [401, { error: 'Sign in required' }]);
		}
		assert.equal((await fetch(`${url}/api/chat`, { method: 'POST' })).status, 401);
		assert.equal((await fetch(`${url}/api/reports/2026-10`, { headers: { cookie: valid } })).status, 200);
		assert.deepEqual(await (await fetch(`${url}/api/auth/me`, { headers: { cookie: valid } })).json(), { name: 'Staff One', email: 'staff@example.test', superadmin: false });
	});
});

test('the HTTP callback answers a non-member with a 403 page and a retry link, clears the login cookie, sets no session', async () => {
	const flow = login(later(() => idToken({ nonce: flow.nonce, preferred_username: 'outsider@example.test' })));
	await withServer(createApp(store, async () => ({}), undefined, config, flow.deps, undefined, team()), async (url) => {
		const response = await fetch(`${url}/api/auth/callback?code=c&state=${flow.state}`, { headers: { cookie: `login=${flow.cookie}` }, redirect: 'manual' });
		assert.equal(response.status, 403);
		assert.match(response.headers.get('content-type')!, /^text\/html/);
		const page = await response.text();
		assert.match(page, /not on the Tech Success team/);
		assert.match(page, /href="\/api\/auth\/login"/);
		assert.deepEqual(response.headers.getSetCookie(), ['login=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax']);
	});
});

test('login redirects to Entra; callback sets the session; same-origin POST logout clears it, cross-site or GET does not', async () => {
	const flow = login(later(() => idToken({ name: 'Staff One', nonce: flow.nonce, preferred_username: 'staff@example.test' })));
	await withServer(createApp(store, async () => ({}), undefined, config, flow.deps, undefined, team()), async (url) => {
		const start = await fetch(`${url}/api/auth/login`, { redirect: 'manual' });
		assert.equal(start.status, 302);
		assert.match(start.headers.get('location')!, /^https:\/\/login\.microsoftonline\.com\/00000000-0000-4000-8000-000000000001\/oauth2\/v2\.0\/authorize\?/);
		const done = await fetch(`${url}/api/auth/callback?code=c&state=${flow.state}`, { headers: { cookie: `login=${flow.cookie}` }, redirect: 'manual' });
		assert.equal(done.status, 302);
		assert.equal(done.headers.get('location'), '/');
		assert.match(done.headers.getSetCookie()[0], /^session=/);
		assert.equal((await fetch(`${url}/api/auth/logout`, { redirect: 'manual' })).status, 401, 'GET logout is gone');
		const out = await fetch(`${url}/api/auth/logout`, { method: 'POST', headers: { origin: config.publicUrl }, redirect: 'manual' });
		assert.equal(out.status, 303);
		assert.equal(out.headers.get('set-cookie'), 'session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax');
		assert.match(out.headers.get('location')!, /\/oauth2\/v2\.0\/logout\?post_logout_redirect_uri=https%3A%2F%2Fapp\.example\.test%2F$/);
		for (const origin of ['https://evil.example', undefined]) {
			const refused = await fetch(`${url}/api/auth/logout`, { method: 'POST', headers: origin ? { origin } : {}, redirect: 'manual' });
			assert.equal(refused.status, 403, String(origin));
			assert.equal(refused.headers.get('set-cookie'), null);
		}
	});
});

test('removing a member ends their session on the next request', async () => {
	const members = team();
	await withServer(createApp(store, async () => ({}), undefined, config, undefined, undefined, members), async (url) => {
		const cookie = sessionFor('staff@example.test');
		assert.equal((await fetch(`${url}/api/reports/2026-10`, { headers: { cookie } })).status, 200);
		members.set.delete('staff@example.test');
		const response = await fetch(`${url}/api/reports/2026-10`, { headers: { cookie } });
		assert.equal(response.status, 403);
		assert.equal(response.headers.get('set-cookie'), 'session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax');
	});
});

test('only the superadmin adds and removes members; the superadmin is always in and cannot be removed', async () => {
	const members = team();
	await withServer(createApp(store, async () => ({}), undefined, config, undefined, undefined, members), async (url) => {
		const admin = { cookie: sessionFor('admin@example.test'), 'content-type': 'application/json' };
		const staff = { cookie: sessionFor('staff@example.test'), 'content-type': 'application/json' };
		assert.equal(((await (await fetch(`${url}/api/auth/me`, { headers: admin })).json()) as { superadmin: boolean }).superadmin, true);
		assert.deepEqual(await (await fetch(`${url}/api/members`, { headers: staff })).json(), { superadmin: 'admin@example.test', members: ['staff@example.test'] });
		assert.equal((await fetch(`${url}/api/members`, { method: 'POST', headers: staff, body: JSON.stringify({ email: 'new@example.test' }) })).status, 403);
		assert.equal((await fetch(`${url}/api/members/staff%40example.test`, { method: 'DELETE', headers: staff })).status, 403);
		assert.equal((await fetch(`${url}/api/members`, { method: 'POST', headers: admin, body: JSON.stringify({ email: 'nope' }) })).status, 400);
		assert.equal((await fetch(`${url}/api/members`, { method: 'POST', headers: admin, body: JSON.stringify({ email: ' New@Example.test ' }) })).status, 201);
		assert.equal((await fetch(`${url}/api/members/admin%40example.test`, { method: 'DELETE', headers: admin })).status, 400);
		assert.equal((await fetch(`${url}/api/members/staff%40example.test`, { method: 'DELETE', headers: admin })).status, 204);
		assert.deepEqual([...members.set], ['new@example.test']);
	});
});

test('without auth config the app behaves as before: no login routes, API open on loopback', async () => {
	await withServer(createApp(store, async () => ({})), async (url) => {
		assert.equal((await fetch(`${url}/api/reports/2026-10`)).status, 200);
		assert.equal((await fetch(`${url}/api/auth/login`, { redirect: 'manual' })).status, 404);
	});
	const members = team();
	await withServer(createApp(store, async () => ({}), undefined, null, undefined, undefined, members), async (url) => {
		const added = await fetch(`${url}/api/members`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'dev@example.test' }) });
		assert.equal(added.status, 201, 'loopback dev manages the team');
		assert.ok(members.set.has('dev@example.test'));
	});
});

test('the built frontend is served without a session; SPA routes fall back to index.html, /api does not', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'frontend-dist-'));
	await writeFile(join(dir, 'index.html'), '<!doctype html><div id="root"></div>');
	await withServer(createApp(store, async () => ({}), undefined, config, undefined, dir), async (url) => {
		for (const path of ['/', '/dashboard', '/index.html']) {
			const response = await fetch(`${url}${path}`);
			assert.equal(response.status, 200, path);
			assert.match(await response.text(), /id="root"/);
		}
		assert.equal((await fetch(`${url}/api/unknown`)).status, 401);
	});
});

test('the login and session cookies cannot stand in for each other', async () => {
	const flow = login(later(() => idToken({ nonce: flow.nonce, preferred_username: 'staff@example.test' })));
	assert.equal(readSession(config, `session=${flow.cookie}`, NOW), null);
	const session = signCookie(config.sessionSecret, { typ: 'session', name: 'A', state: flow.state, nonce: flow.nonce, verifier: 'v' }, 60, NOW);
	await assert.rejects(finishLogin(config, { code: 'c', state: flow.state }, session, flow.deps), (e: { status?: number }) => e.status === 400);
	assert.equal(readSession(config, `session=${signCookie(config.sessionSecret, { name: 'A' }, 60, NOW)}`, NOW), null);
});

test('only RS256 id tokens are accepted', async () => {
	const { SignJWT: Sign } = await import('jose');
	const hmac = new TextEncoder().encode('k'.repeat(32));
	const flow = login(later(() => new Sign({ nonce: flow.nonce, preferred_username: 'staff@example.test' })
		.setProtectedHeader({ alg: 'HS256' }).setIssuer(`https://login.microsoftonline.com/${config.tenantId}/v2.0`)
		.setAudience(config.clientId).setExpirationTime(NOW / 1000 + 600).sign(hmac)));
	flow.deps.keys = async () => hmac as never;
	await assert.rejects(finishLogin(config, { code: 'c', state: flow.state }, flow.cookie, flow.deps), (e: { status?: number }) => e.status === 401);
});

test('/api/health never touches the database; /health reports it', async () => {
	let checks = 0;
	const down = { check: async () => { checks++; throw new Error('db down'); }, read: async () => [] };
	await withServer(createApp(down, async () => ({}), undefined, config), async (url) => {
		assert.deepEqual([(await fetch(`${url}/api/health`)).status, checks], [200, 0]);
		assert.deepEqual([(await fetch(`${url}/health`)).status, checks], [503, 1]);
	});
});

test('a failed token request shows the sign-in page, not an internal error', async () => {
	const flow = login('');
	flow.deps.fetch = (async () => { throw new Error('network down'); }) as typeof fetch;
	await withServer(createApp(store, async () => ({}), undefined, config, flow.deps), async (url) => {
		const response = await fetch(`${url}/api/auth/callback?code=c&state=${flow.state}`, { headers: { cookie: `login=${flow.cookie}` } });
		assert.equal(response.status, 502);
		assert.match(await response.text(), /Sign-in failed; try again[\s\S]*\/api\/auth\/login/);
	});
});

test('BACKEND_PORT wins over a stray PORT; the image sets only PORT', () => {
	assert.equal(listenPort({ BACKEND_PORT: '3001', PORT: '8080' }), 3001);
	assert.equal(listenPort({ PORT: '8080' }), 8080);
	assert.equal(listenPort({}), 3001);
});
