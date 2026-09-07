import type { TeamsBotConfig } from './config.ts';
import { ExternalRequestError, fetchOk, type Fetch, type Sleep } from './http.ts';

/**
 * Proactive one-to-one Teams messages through the Bot Connector.
 *
 * Microsoft Graph cannot do this from an unattended job: `POST
 * /chats/{id}/messages` has no usable application permission. The verified path
 * (`docs/mvp-roadmap.md`, V2 milestone 1) is a client-credentials token for the
 * Bot Framework scope, then create a conversation, then post one activity. No
 * inbound endpoint and no hosting are involved.
 *
 * Notify-only by design: this module never reads a reply, and a chat reply is
 * never evidence that an SLA was satisfied (`AGENTS.md`).
 */

const BOT_SCOPE = 'https://api.botframework.com/.default';
/** Audience Entra expects when exchanging a GitHub OIDC token. */
const FEDERATION_AUDIENCE = 'api://AzureADTokenExchange';

export type DeliveryFailureReason = 'not-installed' | 'writes-blocked' | 'other';

export class TeamsDeliveryError extends Error {
	readonly reason: DeliveryFailureReason;

	constructor(reason: DeliveryFailureReason, message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = 'TeamsDeliveryError';
		this.reason = reason;
	}
}

export interface DirectMessage {
	/** Microsoft Entra object id. Teams rejects an email or user principal name here. */
	entraObjectId: string;
	text: string;
}

export interface BotSender {
	send(message: DirectMessage): Promise<void>;
}

/**
 * Resolves the token once, then reuses it for every recipient in the run.
 */
export async function createBotSender(
	config: TeamsBotConfig,
	env: NodeJS.ProcessEnv = process.env,
	fetchImpl: Fetch = fetch,
	sleep?: Sleep,
): Promise<BotSender> {
	const token = await acquireBotToken(config, env, fetchImpl, sleep);
	return {
		async send(message) {
			const conversationId = await createConversation(
				message.entraObjectId,
				config,
				token,
				fetchImpl,
				sleep,
			);
			await postActivity(conversationId, message.text, config, token, fetchImpl, sleep);
		},
	};
}

export async function acquireBotToken(
	config: TeamsBotConfig,
	env: NodeJS.ProcessEnv = process.env,
	fetchImpl: Fetch = fetch,
	sleep?: Sleep,
): Promise<string> {
	const body = new URLSearchParams({
		grant_type: 'client_credentials',
		client_id: config.appId,
		scope: BOT_SCOPE,
	});
	if (config.appPassword) {
		body.set('client_secret', config.appPassword);
	} else {
		body.set(
			'client_assertion_type',
			'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
		);
		body.set('client_assertion', await requestGithubOidcToken(env, config, fetchImpl, sleep));
	}

	const response = await fetchOk(
		`https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/token`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: body.toString(),
		},
		config.http,
		fetchImpl,
		sleep,
	);
	const token = ((await response.json()) as { access_token?: string }).access_token;
	if (!token) throw new Error('Entra returned no access_token for the Bot Framework scope');
	return token;
}

/**
 * The secretless credential decided in `docs/mvp-roadmap.md`: GitHub mints a
 * short-lived OIDC token, Entra trades it for a bot token. Nothing to store or
 * rotate.
 */
async function requestGithubOidcToken(
	env: NodeJS.ProcessEnv,
	config: TeamsBotConfig,
	fetchImpl: Fetch,
	sleep?: Sleep,
): Promise<string> {
	const requestUrl = env.ACTIONS_ID_TOKEN_REQUEST_URL?.trim();
	const requestToken = env.ACTIONS_ID_TOKEN_REQUEST_TOKEN?.trim();
	if (!requestUrl || !requestToken) {
		throw new Error(
			'GitHub OIDC is unavailable: no TEAMS_BOT_APP_PASSWORD and no ACTIONS_ID_TOKEN_REQUEST_URL',
		);
	}

	const url = new URL(requestUrl);
	url.searchParams.set('audience', FEDERATION_AUDIENCE);
	const response = await fetchOk(
		url.toString(),
		{ headers: { Authorization: `Bearer ${requestToken}` } },
		config.http,
		fetchImpl,
		sleep,
	);
	const value = ((await response.json()) as { value?: string }).value;
	if (!value) throw new Error('GitHub OIDC endpoint returned no token value');
	return value;
}

async function createConversation(
	entraObjectId: string,
	config: TeamsBotConfig,
	token: string,
	fetchImpl: Fetch,
	sleep?: Sleep,
): Promise<string> {
	const response = await botFetch(
		'v3/conversations',
		{
			method: 'POST',
			body: JSON.stringify({
				bot: { id: `28:${config.appId}` },
				members: [{ id: entraObjectId }],
				channelData: { tenant: { id: config.tenantId } },
				isGroup: false,
				tenantId: config.tenantId,
			}),
		},
		config,
		token,
		fetchImpl,
		sleep,
	);
	const conversationId = ((await response.json()) as { id?: string }).id;
	if (!conversationId) throw new TeamsDeliveryError('other', 'Bot Connector returned no conversation id');
	return conversationId;
}

async function postActivity(
	conversationId: string,
	text: string,
	config: TeamsBotConfig,
	token: string,
	fetchImpl: Fetch,
	sleep?: Sleep,
): Promise<void> {
	await botFetch(
		`v3/conversations/${encodeURIComponent(conversationId)}/activities`,
		{
			method: 'POST',
			body: JSON.stringify({ type: 'message', textFormat: 'markdown', text }),
		},
		config,
		token,
		fetchImpl,
		sleep,
	);
}

async function botFetch(
	path: string,
	init: RequestInit,
	config: TeamsBotConfig,
	token: string,
	fetchImpl: Fetch,
	sleep?: Sleep,
): Promise<Response> {
	const base = config.serviceUrl.endsWith('/') ? config.serviceUrl : `${config.serviceUrl}/`;
	try {
		return await fetchOk(
			new URL(path, base).toString(),
			{
				...init,
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json',
					Accept: 'application/json',
				},
			},
			config.http,
			fetchImpl,
			sleep,
		);
	} catch (error) {
		throw asDeliveryError(error);
	}
}

/**
 * Teams answers several unrelated conditions with 403, and they need different
 * human responses: one is a missing app installation, the other a tenant policy
 * blocking bot messages to that person.
 */
function asDeliveryError(error: unknown): unknown {
	if (!(error instanceof ExternalRequestError) || error.status !== 403) return error;
	if (error.body.includes('ForbiddenOperationException')) {
		return new TeamsDeliveryError(
			'not-installed',
			'Teams refused the direct message: the bot is not installed in the recipient\'s personal scope',
			{ cause: error },
		);
	}
	if (error.body.includes('MessageWritesBlocked')) {
		return new TeamsDeliveryError(
			'writes-blocked',
			'Teams blocked writes to the recipient: a tenant or app policy forbids bot messages',
			{ cause: error },
		);
	}
	return new TeamsDeliveryError('other', 'Teams refused the direct message with 403', {
		cause: error,
	});
}
