export interface HttpConfig {
	timeoutMs: number;
	maxRetries: number;
}

export interface JiraConfig {
	baseUrl: string;
	email: string;
	apiToken: string;
	jql: string;
	pageSize: number;
	maxResults: number;
	maxSearchPages: number;
	slaPageSize: number;
	maxSlaPages: number;
	slaConcurrency: number;
	firstResponseSlaName: string;
	/** The JSM metric that drives the escalation clock in `docs/sla-matrix.md`. */
	resolutionSlaName: string;
	http: HttpConfig;
}

export interface TeamsBotConfig {
	appId: string;
	tenantId: string;
	/**
	 * Client secret for local use. Null in GitHub Actions, where the token is
	 * obtained through the OIDC federated credential instead.
	 */
	appPassword: string | null;
	/** Bot Connector service URL for the tenant's Teams region. */
	serviceUrl: string;
	http: HttpConfig;
}

export interface EscalationConfigPaths {
	/** Person directory and per-project L2-L5 mapping. */
	configFile: string;
	/** Highest level already notified per ticket, restored from the Actions cache. */
	stateFile: string;
}

export interface ReminderConfig {
	repeatMinutes: number;
	deliveryWindowMinutes: number;
	useLlmIntro: boolean;
	introTimeoutMs: number;
	dryRun: boolean;
	maxMessageChars: number;
	/**
	 * One-time rollout step: record every escalation level already crossed
	 * without notifying anyone, so switching the bot on does not deliver the
	 * whole backlog at once.
	 */
	escalationSeedOnly: boolean;
}

export interface AppConfig {
	jira: JiraConfig;
	teamsWebhookUrl: string | null;
	/** Null when the personal-bot transport is not configured; channel post only. */
	bot: TeamsBotConfig | null;
	escalation: EscalationConfigPaths;
	reminder: ReminderConfig;
	http: HttpConfig;
}

const DEFAULT_JQL =
'project = DC AND statusCategory != Done AND assignee is not EMPTY ORDER BY priority DESC, updated ASC';

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
	const http = {
		timeoutMs: integer(env, 'HTTP_TIMEOUT_MS', 10_000, 1_000, 120_000),
		maxRetries: integer(env, 'HTTP_MAX_RETRIES', 2, 0, 5),
	};
	const repeatMinutes = integer(env, 'REMINDER_REPEAT_MINUTES', 60, 15, 1_440);
	const deliveryWindowMinutes = integer(env, 'REMINDER_DELIVERY_WINDOW_MINUTES', 15, 1, 60);
	if (deliveryWindowMinutes > repeatMinutes) {
		throw new Error('REMINDER_DELIVERY_WINDOW_MINUTES must not exceed REMINDER_REPEAT_MINUTES');
	}

	const dryRun = boolean(env, 'REMINDER_DRY_RUN', false);
	const teamsWebhookUrl = optionalHttpsUrl(env, 'TEAMS_WEBHOOK_URL');
	const bot = loadBotConfig(env, http, dryRun);
	if (!dryRun && !teamsWebhookUrl && !bot) {
		throw new Error(
			'No Teams transport configured: set TEAMS_WEBHOOK_URL for the channel post, '
				+ 'TEAMS_BOT_APP_ID and TEAMS_BOT_TENANT_ID for direct messages, or both',
		);
	}
	const jql = env.JIRA_JQL?.trim();
	if (!dryRun && !jql) {
		throw new Error('Missing required env var: JIRA_JQL');
	}

	return {
		http,
		jira: {
			baseUrl: httpsUrl(env, 'JIRA_BASE_URL').replace(/\/$/, ''),
			email: required(env, 'JIRA_EMAIL'),
			apiToken: required(env, 'JIRA_API_TOKEN'),
			jql: jql || DEFAULT_JQL,
			pageSize: integer(env, 'JIRA_PAGE_SIZE', 50, 1, 100),
			maxResults: integer(env, 'JIRA_MAX_RESULTS', 500, 1, 5_000),
			maxSearchPages: integer(env, 'JIRA_MAX_SEARCH_PAGES', 100, 1, 1_000),
			slaPageSize: integer(env, 'JIRA_SLA_PAGE_SIZE', 50, 1, 100),
			maxSlaPages: integer(env, 'JIRA_MAX_SLA_PAGES', 10, 1, 100),
			slaConcurrency: integer(env, 'JIRA_SLA_CONCURRENCY', 5, 1, 20),
			firstResponseSlaName:
				env.JIRA_FIRST_RESPONSE_SLA_NAME?.trim() || 'Time To First Response',
			resolutionSlaName: env.JIRA_RESOLUTION_SLA_NAME?.trim() || 'Time to resolution',
			http,
		},
		teamsWebhookUrl,
		bot,
		escalation: {
			configFile: env.ESCALATION_CONFIG_FILE?.trim() || 'config/escalation.json',
			stateFile: env.ESCALATION_STATE_FILE?.trim() || '.escalation-state/state.json',
		},
		reminder: {
			repeatMinutes,
			deliveryWindowMinutes,
			useLlmIntro: boolean(env, 'REMINDER_USE_LLM_INTRO', false),
			introTimeoutMs: integer(env, 'REMINDER_INTRO_TIMEOUT_MS', 10_000, 1_000, 120_000),
			dryRun,
			maxMessageChars: integer(env, 'TEAMS_MAX_MESSAGE_CHARS', 12_000, 1_000, 25_000),
			escalationSeedOnly: boolean(env, 'ESCALATION_SEED_ONLY', false),
		},
	};
}

/**
 * The bot transport is opt-in: with no app id and tenant id the workflow keeps
 * posting to the channel only. Once opted in, a missing credential is a visible
 * failure rather than a silently skipped direct message.
 */
function loadBotConfig(
	env: NodeJS.ProcessEnv,
	http: HttpConfig,
	dryRun: boolean,
): TeamsBotConfig | null {
	const appId = env.TEAMS_BOT_APP_ID?.trim();
	const tenantId = env.TEAMS_BOT_TENANT_ID?.trim();
	if (!appId && !tenantId) return null;
	if (!appId || !tenantId) {
		throw new Error('TEAMS_BOT_APP_ID and TEAMS_BOT_TENANT_ID must be set together');
	}

	const appPassword = env.TEAMS_BOT_APP_PASSWORD?.trim() || null;
	// A dry run never asks for a token, so it can exercise routing without one.
	if (!dryRun && !appPassword && !env.ACTIONS_ID_TOKEN_REQUEST_URL?.trim()) {
		throw new Error(
			'Teams bot needs a credential: set TEAMS_BOT_APP_PASSWORD, or run where GitHub '
				+ 'OIDC is available (permissions: id-token: write) for the federated credential',
		);
	}

	const serviceUrl = env.TEAMS_BOT_SERVICE_URL?.trim() || 'https://smba.trafficmanager.net/teams/';
	validateHttpsUrl(serviceUrl, 'TEAMS_BOT_SERVICE_URL');
	return { appId, tenantId, appPassword, serviceUrl, http };
}

function required(env: NodeJS.ProcessEnv, name: string): string {
	const value = env[name]?.trim();
	if (!value) throw new Error(`Missing required env var: ${name}`);
	return value;
}

function httpsUrl(env: NodeJS.ProcessEnv, name: string): string {
	const value = required(env, name);
	validateHttpsUrl(value, name);
	return value;
}

function optionalHttpsUrl(env: NodeJS.ProcessEnv, name: string): string | null {
	const value = env[name]?.trim();
	if (!value) return null;
	validateHttpsUrl(value, name);
	return value;
}

function validateHttpsUrl(value: string, name: string): void {
	let parsed: URL;
	try {
		parsed = new URL(value);
	} catch {
		throw new Error(`${name} must be a valid URL`);
	}
	if (parsed.protocol !== 'https:') throw new Error(`${name} must use HTTPS`);
}

function integer(
	env: NodeJS.ProcessEnv,
	name: string,
	fallback: number,
	min: number,
	max: number,
): number {
	const raw = env[name]?.trim();
	if (!raw) return fallback;
	const value = Number(raw);
	if (!Number.isInteger(value) || value < min || value > max) {
		throw new Error(`${name} must be an integer between ${min} and ${max}`);
	}
	return value;
}

function boolean(env: NodeJS.ProcessEnv, name: string, fallback: boolean): boolean {
	const raw = env[name]?.trim().toLowerCase();
	if (!raw) return fallback;
	if (raw === 'true') return true;
	if (raw === 'false') return false;
	throw new Error(`${name} must be true or false`);
}
