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
	http: HttpConfig;
}

export interface ReminderConfig {
	repeatMinutes: number;
	deliveryWindowMinutes: number;
	useLlmIntro: boolean;
	dryRun: boolean;
	maxMessageChars: number;
}

export interface AppConfig {
	jira: JiraConfig;
	teamsWebhookUrl: string | null;
	reminder: ReminderConfig;
	http: HttpConfig;
}

const DEFAULT_JQL =
	'statusCategory != Done AND assignee is not EMPTY ORDER BY priority DESC, updated ASC';

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
	if (!dryRun && !teamsWebhookUrl) {
		throw new Error('Missing required env var: TEAMS_WEBHOOK_URL');
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
			http,
		},
		teamsWebhookUrl,
		reminder: {
			repeatMinutes,
			deliveryWindowMinutes,
			useLlmIntro: boolean(env, 'REMINDER_USE_LLM_INTRO', false),
			dryRun,
			maxMessageChars: integer(env, 'TEAMS_MAX_MESSAGE_CHARS', 12_000, 1_000, 25_000),
		},
	};
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
