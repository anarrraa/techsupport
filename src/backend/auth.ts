// Entra ID staff login (for-agents/prd-hosting-auth.md). Framework-free: server.ts wires these into express.
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

export interface AuthConfig {
	tenantId: string;
	clientId: string;
	clientSecret: string;
	allowedGroupId: string;
	sessionSecret: string;
	publicUrl: string;
}

export const SESSION_COOKIE = 'session';
export const LOGIN_COOKIE = 'login';
export const SESSION_SECONDS = 8 * 60 * 60;
export const LOGIN_SECONDS = 10 * 60;
const TOKEN_TIMEOUT_MS = 10_000;

const VARS = {
	tenantId: 'ENTRA_TENANT_ID',
	clientId: 'ENTRA_CLIENT_ID',
	clientSecret: 'ENTRA_CLIENT_SECRET',
	allowedGroupId: 'ENTRA_ALLOWED_GROUP_ID',
	sessionSecret: 'SESSION_SECRET',
	publicUrl: 'PUBLIC_URL',
} as const;

export class AuthError extends Error {
	readonly status: number;
	constructor(status: number, message: string) { super(message); this.status = status; }
}

/** None set → null (localhost dev). Some set → error naming the missing ones: half a config never runs. */
export function authConfig(env: Record<string, string | undefined> = process.env): AuthConfig | null {
	const entries = Object.entries(VARS).map(([key, name]) => [key, env[name]?.trim() ?? ''] as const);
	const missing = entries.filter(([, value]) => !value).map(([key]) => VARS[key as keyof typeof VARS]);
	if (missing.length === entries.length) return null;
	if (missing.length) throw new Error(`Auth is partially configured; missing ${missing.join(', ')}`);
	const config = Object.fromEntries(entries) as unknown as AuthConfig;
	if (config.sessionSecret.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters');
	if (!/^https:\/\/[^/]+$/.test(config.publicUrl) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(config.publicUrl)) {
		throw new Error('PUBLIC_URL must be an https origin without a path');
	}
	return config;
}

const isLoopback = (host: string) => host === 'localhost' || host === '::1' || /^127\.\d+\.\d+\.\d+$/.test(host);

/** Fail closed: an unauthenticated API may only listen on loopback. */
export function assertExposure(host: string, config: AuthConfig | null) {
	if (!config && !isLoopback(host)) {
		throw new Error(`Refusing to listen on ${host} without auth: set ${Object.values(VARS).join(', ')}`);
	}
}

const b64 = (data: Buffer | string) => Buffer.from(data).toString('base64url');
const mac = (secret: string, payload: string) => createHmac('sha256', secret).update(payload).digest('base64url');

/** `<base64url JSON>.<HMAC>`; `exp` (unix seconds) lives inside the signed part. */
export function signCookie(secret: string, data: object, seconds: number, now = Date.now()): string {
	const payload = b64(JSON.stringify({ ...data, exp: Math.floor(now / 1000) + seconds }));
	return `${payload}.${mac(secret, payload)}`;
}

export function verifyCookie<T>(secret: string, value: string | undefined, now = Date.now()): T | null {
	const [payload, signature, extra] = value?.split('.') ?? [];
	if (!payload || !signature || extra !== undefined) return null;
	const expected = Buffer.from(mac(secret, payload));
	const given = Buffer.from(signature);
	if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
	try {
		const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as T & { exp?: unknown };
		return typeof data.exp === 'number' && data.exp * 1000 > now ? data : null;
	} catch {
		return null;
	}
}

export function readCookie(header: string | undefined, name: string): string | undefined {
	for (const part of header?.split(';') ?? []) {
		const at = part.indexOf('=');
		if (at > 0 && part.slice(0, at).trim() === name) return part.slice(at + 1).trim();
	}
	return undefined;
}

export function cookie(name: string, value: string, seconds: number): string {
	return `${name}=${value}; Max-Age=${seconds}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

const authority = (config: AuthConfig) => `https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}`;
const redirectUri = (config: AuthConfig) => `${config.publicUrl}/api/auth/callback`;

interface LoginState { state: string; nonce: string; verifier: string }

/** Authorize URL plus the signed short-lived cookie that carries state, nonce and the PKCE verifier to the callback. */
export function startLogin(config: AuthConfig, now = Date.now()): { url: string; cookie: string } {
	const login: LoginState = { state: b64(randomBytes(16)), nonce: b64(randomBytes(16)), verifier: b64(randomBytes(32)) };
	const query = new URLSearchParams({
		client_id: config.clientId,
		response_type: 'code',
		redirect_uri: redirectUri(config),
		response_mode: 'query',
		scope: 'openid profile',
		state: login.state,
		nonce: login.nonce,
		code_challenge: b64(createHash('sha256').update(login.verifier).digest()),
		code_challenge_method: 'S256',
	});
	return {
		url: `${authority(config)}/oauth2/v2.0/authorize?${query}`,
		cookie: cookie(LOGIN_COOKIE, signCookie(config.sessionSecret, login, LOGIN_SECONDS, now), LOGIN_SECONDS),
	};
}

export interface LoginDeps {
	fetch: typeof fetch;
	keys: JWTVerifyGetKey;
	now: number;
}

// jose caches the key set and bounds its fetch (default 5 s timeout).
const tenantKeys = new Map<string, JWTVerifyGetKey>();
export function entraKeys(config: AuthConfig): JWTVerifyGetKey {
	let keys = tenantKeys.get(config.tenantId);
	if (!keys) tenantKeys.set(config.tenantId, keys = createRemoteJWKSet(new URL(`${authority(config)}/discovery/v2.0/keys`)));
	return keys;
}

/**
 * Callback: check state, redeem the code with the PKCE verifier, verify the id token, require the group.
 * Returns the session cookie. 400/401 = the login itself is bad, 403 = a real user outside the group.
 */
export async function finishLogin(
	config: AuthConfig,
	query: { code?: unknown; state?: unknown; error?: unknown },
	loginCookie: string | undefined,
	deps: LoginDeps = { fetch, keys: entraKeys(config), now: Date.now() },
): Promise<{ cookie: string; name: string }> {
	const login = verifyCookie<LoginState>(config.sessionSecret, loginCookie, deps.now);
	if (typeof query.error === 'string') throw new AuthError(401, 'Sign-in was cancelled or refused');
	if (!login || typeof query.state !== 'string' || query.state !== login.state) throw new AuthError(400, 'Sign-in expired; start again');
	if (typeof query.code !== 'string' || !query.code) throw new AuthError(400, 'Missing authorization code');

	const response = await deps.fetch(`${authority(config)}/oauth2/v2.0/token`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			client_id: config.clientId,
			client_secret: config.clientSecret,
			grant_type: 'authorization_code',
			code: query.code,
			redirect_uri: redirectUri(config),
			code_verifier: login.verifier,
		}),
		signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
	});
	if (!response.ok) throw new AuthError(401, `Token request failed (${response.status})`);
	const { id_token: idToken } = await response.json() as { id_token?: unknown };
	if (typeof idToken !== 'string') throw new AuthError(401, 'Token response has no id_token');

	let claims;
	try {
		({ payload: claims } = await jwtVerify(idToken, deps.keys, {
			issuer: `https://login.microsoftonline.com/${config.tenantId}/v2.0`,
			audience: config.clientId,
			currentDate: new Date(deps.now),
		}));
	} catch {
		throw new AuthError(401, 'Invalid id token');
	}
	if (claims.nonce !== login.nonce) throw new AuthError(401, 'Invalid id token');
	// No `groups` (overage or claim not configured) is a refusal, never a Graph lookup.
	if (!Array.isArray(claims.groups) || !claims.groups.includes(config.allowedGroupId)) {
		throw new AuthError(403, 'Your account is not in the group allowed to use this app');
	}
	const name = typeof claims.name === 'string' && claims.name ? claims.name : 'Staff';
	return { name, cookie: cookie(SESSION_COOKIE, signCookie(config.sessionSecret, { name }, SESSION_SECONDS, deps.now), SESSION_SECONDS) };
}

export function readSession(config: AuthConfig, cookieHeader: string | undefined, now = Date.now()): { name: string } | null {
	const session = verifyCookie<{ name?: unknown }>(config.sessionSecret, readCookie(cookieHeader, SESSION_COOKIE), now);
	return session && typeof session.name === 'string' ? { name: session.name } : null;
}

export function logoutUrl(config: AuthConfig): string {
	return `${authority(config)}/oauth2/v2.0/logout?${new URLSearchParams({ post_logout_redirect_uri: config.publicUrl })}`;
}
