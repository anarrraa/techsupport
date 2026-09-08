import type { TeamsBotConfig } from './config.ts';
import { ExternalRequestError, fetchOk, type Fetch, type Sleep } from './http.ts';

/**
 * Proactive one-to-one Teams messages, following the path already in production
 * in this tenant (`zero/goOrange`, `supabase/functions/teams-bot/index.ts`).
 *
 * Microsoft Graph cannot post the message — `POST /chats/{id}/messages` has no
 * usable application permission — but it can do the two things that make the
 * message deliverable: install the app for the recipient, and hand back the
 * personal chat id. The Bot Connector then posts one activity into that chat.
 *
 * The alternative, `POST /v3/conversations`, fails with
 * `403 ForbiddenOperationException` for anyone who has not installed the app
 * themselves. Installing first removes that failure instead of reporting it,
 * which is why this route is worth two extra Graph calls per recipient.
 *
 * Notify-only by design: nothing here reads a reply, and a chat reply is never
 * evidence that an SLA was satisfied (`AGENTS.md`).
 */

const BOT_SCOPE = 'https://api.botframework.com/.default';
const GRAPH_SCOPE = 'https://graph.microsoft.com/.default';
const GRAPH = 'https://graph.microsoft.com/v1.0';
/** Audience Entra expects when exchanging a GitHub OIDC token. */
const FEDERATION_AUDIENCE = 'api://AzureADTokenExchange';

export type DeliveryFailureReason =
	/** The app is not published to the organisation's Teams catalog. */
	| 'not-in-catalog'
	/** Graph refused to install the app for this person. */
	| 'install-forbidden'
	/** Teams has no personal installation to message. */
	| 'not-installed'
	/** A tenant or app policy forbids bot messages to this person. */
	| 'writes-blocked'
	| 'other';

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

interface Tokens {
	bot: string;
	graph: string;
}

export async function createBotSender(
	config: TeamsBotConfig,
	env: NodeJS.ProcessEnv = process.env,
	fetchImpl: Fetch = fetch,
	sleep?: Sleep,
): Promise<BotSender> {
	const tokens: Tokens = {
		bot: await acquireToken(BOT_SCOPE, config, config.appId, config.appPassword, env, fetchImpl, sleep),
		graph: await acquireToken(
			GRAPH_SCOPE,
			config,
			config.graphClientId,
			config.graphClientSecret,
			env,
			fetchImpl,
			sleep,
		),
	};
	// One catalog lookup and one chat lookup per person, for the whole run: a
	// person can appear twice, as an assignee and as an escalation contact.
	let catalogId: string | null = null;
	const chatIds = new Map<string, string>();

	return {
		async send(message) {
			catalogId ??= await resolveCatalogAppId(config, tokens.graph, fetchImpl, sleep);
			let chatId = chatIds.get(message.entraObjectId);
			if (!chatId) {
				chatId = await resolvePersonalChatId(
					message.entraObjectId,
					catalogId,
					config,
					tokens.graph,
					fetchImpl,
					sleep,
				);
				chatIds.set(message.entraObjectId, chatId);
			}
			await postActivity(chatId, message.text, config, tokens.bot, fetchImpl, sleep);
		},
	};
}

/**
 * Client credentials, by secret locally and by GitHub OIDC federated credential
 * in Actions, so nothing has to be stored or rotated in CI.
 */
export async function acquireToken(
	scope: string,
	config: TeamsBotConfig,
	clientId: string,
	clientSecret: string | null,
	env: NodeJS.ProcessEnv = process.env,
	fetchImpl: Fetch = fetch,
	sleep?: Sleep,
): Promise<string> {
	const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, scope });
	if (clientSecret) {
		body.set('client_secret', clientSecret);
	} else {
		body.set('client_assertion_type', 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer');
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
	if (!token) throw new Error(`Entra returned no access_token for ${scope}`);
	return token;
}

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
			'GitHub OIDC is unavailable: no client secret and no ACTIONS_ID_TOKEN_REQUEST_URL',
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

/**
 * The catalog's own id for the app, which is not the manifest id. Graph matches
 * the manifest id as `externalId`.
 */
async function resolveCatalogAppId(
	config: TeamsBotConfig,
	graphToken: string,
	fetchImpl: Fetch,
	sleep?: Sleep,
): Promise<string> {
	const filter = `externalId eq '${config.appExternalId.replaceAll("'", "''")}'`;
	const body = await graphJson<{ value?: Array<{ id?: string; distributionMethod?: string }> }>(
		`/appCatalogs/teamsApps?$filter=${encodeURIComponent(filter)}&$select=id,distributionMethod`,
		{},
		config,
		graphToken,
		fetchImpl,
		sleep,
	);

	// One person sideloading the package during a pilot creates a second catalog
	// entry with the same external id. Preferring the published one keeps the
	// choice from depending on the order Graph happens to return them, and keeps
	// delivery on the entry every recipient can be installed from.
	const candidates = body.value ?? [];
	const preference = ['organization', 'store', 'sideloaded'];
	const chosen = [...candidates].sort(
		(a, b) =>
			preference.indexOf(a.distributionMethod ?? '') - preference.indexOf(b.distributionMethod ?? ''),
	)[0];
	if (!chosen?.id) {
		throw new TeamsDeliveryError(
			'not-in-catalog',
			`No Teams app in the organisation catalog has external id ${config.appExternalId}; `
				+ 'an administrator has to publish the app package first',
		);
	}
	return chosen.id;
}

async function resolvePersonalChatId(
	entraObjectId: string,
	catalogId: string,
	config: TeamsBotConfig,
	graphToken: string,
	fetchImpl: Fetch,
	sleep?: Sleep,
): Promise<string> {
	const user = `/users/${encodeURIComponent(entraObjectId)}/teamwork/installedApps`;
	const installedFilter = `teamsApp/id eq '${catalogId}'`;
	const query = `?$expand=teamsApp&$filter=${encodeURIComponent(installedFilter)}`;

	let installationId = (
		await graphJson<{ value?: Array<{ id?: string }> }>(
			`${user}${query}`,
			{},
			config,
			graphToken,
			fetchImpl,
			sleep,
		)
	).value?.[0]?.id;

	if (!installationId) {
		try {
			installationId = (
				await graphJson<{ id?: string }>(
					user,
					{
						method: 'POST',
						body: JSON.stringify({
							'teamsApp@odata.bind': `${GRAPH}/appCatalogs/teamsApps/${catalogId}`,
						}),
					},
					config,
					graphToken,
					fetchImpl,
					sleep,
				)
			).id;
		} catch (error) {
			// 409 means a concurrent install won the race, which is a success.
			if (!(error instanceof ExternalRequestError) || error.status !== 409) throw error;
		}
		installationId ??= (
			await graphJson<{ value?: Array<{ id?: string }> }>(
				`${user}${query}`,
				{},
				config,
				graphToken,
				fetchImpl,
				sleep,
			)
		).value?.[0]?.id;
	}

	if (!installationId) {
		throw new TeamsDeliveryError(
			'not-installed',
			'Teams reports no personal installation of the app for this recipient, and installing it produced none',
		);
	}

	const chatId = (
		await graphJson<{ id?: string }>(
			`${user}/${encodeURIComponent(installationId)}/chat`,
			{},
			config,
			graphToken,
			fetchImpl,
			sleep,
		)
	).id;
	if (!chatId) {
		throw new TeamsDeliveryError('not-installed', 'Teams returned no personal chat for the installed app');
	}
	return chatId;
}

async function postActivity(
	chatId: string,
	text: string,
	config: TeamsBotConfig,
	botToken: string,
	fetchImpl: Fetch,
	sleep?: Sleep,
): Promise<void> {
	const base = config.serviceUrl.replace(/\/$/, '');
	try {
		await fetchOk(
			`${base}/v3/conversations/${encodeURIComponent(chatId)}/activities`,
			{
				method: 'POST',
				headers: {
					Authorization: `Bearer ${botToken}`,
					'Content-Type': 'application/json',
					Accept: 'application/json',
				},
				body: JSON.stringify({ type: 'message', textFormat: 'markdown', text }),
			},
			config.http,
			fetchImpl,
			sleep,
		);
	} catch (error) {
		throw asDeliveryError(error);
	}
}

async function graphJson<T>(
	path: string,
	init: RequestInit,
	config: TeamsBotConfig,
	graphToken: string,
	fetchImpl: Fetch,
	sleep?: Sleep,
): Promise<T> {
	try {
		const response = await fetchOk(
			`${GRAPH}${path}`,
			{
				...init,
				headers: {
					Authorization: `Bearer ${graphToken}`,
					'Content-Type': 'application/json',
					Accept: 'application/json',
				},
			},
			config.http,
			fetchImpl,
			sleep,
		);
		const body = await response.text();
		return (body ? JSON.parse(body) : {}) as T;
	} catch (error) {
		if (error instanceof ExternalRequestError && error.status === 403) {
			throw new TeamsDeliveryError(
				'install-forbidden',
				'Graph refused the app installation: the app registration needs '
					+ 'TeamsAppInstallation.ReadWriteForUser.All and AppCatalog.Read.All with admin consent',
				{ cause: error },
			);
		}
		throw error;
	}
}

/**
 * Teams answers several unrelated conditions with 403 and they need different
 * fixes, so they are reported apart rather than as one opaque failure.
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
	return new TeamsDeliveryError('other', 'Teams refused the direct message with 403', { cause: error });
}
