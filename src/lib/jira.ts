import type { JiraConfig } from './config.ts';
import { fetchOk, type Fetch, type Sleep } from './http.ts';

export interface SlaCycle {
	name: string;
	state: 'ongoing' | 'completed';
	breached: boolean;
	paused: boolean;
	withinCalendarHours: boolean;
	breachTimeEpochMillis: number | null;
	/**
	 * Working minutes since the cycle **started**, which is what JSM reports in
	 * `elapsedTime`. Not the time past the target: for a breached cycle this
	 * still includes the whole allowance. Use it only against thresholds that
	 * are themselves measured from the request being raised, as the escalation
	 * matrix is.
	 */
	elapsedMinutes: number | null;
	/**
	 * JSM's `remainingTime`, negative once breached. Its negation is the working
	 * time past the target, which is the only honest figure for "overdue".
	 * Reading it rather than subtracting keeps the arithmetic Jira's.
	 */
	remainingMinutes: number | null;
}

/** A Jira account that belongs to the vendor, never to the client. */
export interface JiraAgent {
	accountId: string;
	displayName: string;
}

export interface JiraTicket {
	key: string;
	summary: string;
	status: string;
	priority: string;
	assignee: string;
	/** Needed to resolve the assignee's Entra object id; absent when unassigned. */
	assigneeAccountId: string | null;
	/**
	 * Request participants, filtered to `accountType: 'atlassian'`.
	 *
	 * The field mixes vendor staff with the client's own portal users, and the
	 * client must never be told they owe a response. `accountType` is Jira's own
	 * answer to which is which, so the filter happens here, at the boundary,
	 * rather than being left for every caller to remember.
	 */
	participants: JiraAgent[];
	url: string;
	firstResponseSla: SlaCycle | null;
	/** The escalation clock of `docs/sla-matrix.md` section 2. */
	resolutionSla: SlaCycle | null;
}

export interface JiraFetchResult {
	tickets: JiraTicket[];
	scanned: number;
	withoutSla: number;
	/** Tickets carrying no resolution metric, so no escalation clock. */
	withoutResolutionSla: number;
	truncated: boolean;
}

export async function fetchTickets(
	config: JiraConfig,
	fetchImpl: Fetch = fetch,
	sleep?: Sleep,
): Promise<JiraFetchResult> {
	const ticketBaseUrl = canonicalTicketBaseUrl(config.baseUrl);
	const issues = await fetchIssuePages(config, fetchImpl, sleep);
	const slas = await mapConcurrent(issues.values, config.slaConcurrency, (issue) =>
		fetchSlaCycles(issue.key, config, fetchImpl, sleep),
	);

	const tickets = issues.values.map((issue, index): JiraTicket => ({
		key: issue.key,
		summary: issue.fields.summary ?? '(no title)',
		status: issue.fields.status?.name ?? 'Unknown',
		priority: issue.fields.priority?.name ?? 'None',
		assignee: issue.fields.assignee?.displayName ?? 'Unassigned',
		assigneeAccountId: issue.fields.assignee?.accountId ?? null,
		participants: agentParticipants(issue, config.participantsField),
		url: buildTicketUrl(ticketBaseUrl, issue.key),
		firstResponseSla: slas[index]?.firstResponse ?? null,
		resolutionSla: slas[index]?.resolution ?? null,
	}));
	const withoutSla = tickets.filter((ticket) => ticket.firstResponseSla === null).length;
	if (tickets.length > 0 && withoutSla === tickets.length) {
		throw new Error(
			`JSM SLA metric "${config.firstResponseSlaName}" was not found on any of ${tickets.length} Jira tickets`,
		);
	}

	return {
		tickets,
		scanned: tickets.length,
		withoutSla,
		withoutResolutionSla: tickets.filter((ticket) => ticket.resolutionSla === null).length,
		truncated: issues.truncated,
	};
}

function agentParticipants(issue: JiraIssue, field: string): JiraAgent[] {
	const raw = (issue.fields as Record<string, unknown>)[field];
	if (!Array.isArray(raw)) return [];
	const agents: JiraAgent[] = [];
	for (const value of raw as JiraUser[]) {
		if (value?.accountType !== 'atlassian' || !value.accountId) continue;
		agents.push({ accountId: value.accountId, displayName: value.displayName ?? 'Unknown' });
	}
	return agents;
}

function canonicalTicketBaseUrl(value: string): URL {
	const url = new URL(value);
	if (url.protocol !== 'https:') throw new Error('Jira base URL must use HTTPS');
	url.pathname = url.pathname.replace(/\/+$/, '');
	url.search = '';
	url.hash = '';
	return url;
}

function buildTicketUrl(baseUrl: URL, issueKey: string): string {
	const url = new URL(baseUrl);
	const basePath = baseUrl.pathname === '/' ? '' : baseUrl.pathname;
	url.pathname = `${basePath}/browse/${encodeURIComponent(issueKey)}`;
	const destination = url.toString().replace(/\(/g, '%28').replace(/\)/g, '%29');
	if (/[\s()]/u.test(destination)) throw new Error('Generated Jira ticket URL is not Markdown-safe');
	return destination;
}

async function fetchIssuePages(
	config: JiraConfig,
	fetchImpl: Fetch,
	sleep?: Sleep,
): Promise<{ values: JiraIssue[]; truncated: boolean }> {
	const values: JiraIssue[] = [];
	let nextPageToken: string | undefined;
	const seenTokens = new Set<string>();
	let hasMore = true;
	let pageWasTruncated = false;
	let page = 0;

	while (hasMore && values.length < config.maxResults) {
		if (page >= config.maxSearchPages) {
			throw new Error(`Jira search pagination exceeded ${config.maxSearchPages} pages`);
		}
		page += 1;
		const maxResults = Math.min(config.pageSize, config.maxResults - values.length);
		const response = await fetchOk(
			`${config.baseUrl}/rest/api/3/search/jql`,
			{
				method: 'POST',
				headers: jiraHeaders(config),
				body: JSON.stringify({
					jql: config.jql,
					maxResults,
					fields: ['summary', 'status', 'priority', 'assignee', config.participantsField],
					...(nextPageToken ? { nextPageToken } : {}),
				}),
			},
			config.http,
			fetchImpl,
			sleep,
		);
		const data = (await response.json()) as JiraSearchResponse;
		const remaining = config.maxResults - values.length;
		const pageIssues = data.issues ?? [];
		pageWasTruncated ||= pageIssues.length > remaining;
		values.push(...pageIssues.slice(0, remaining));

		hasMore = data.isLast === false || Boolean(data.nextPageToken);
		if (!hasMore) break;
		if (!data.nextPageToken || seenTokens.has(data.nextPageToken)) {
			throw new Error('Jira search pagination returned an invalid nextPageToken');
		}
		seenTokens.add(data.nextPageToken);
		nextPageToken = data.nextPageToken;
	}

	return { values, truncated: pageWasTruncated || (hasMore && values.length >= config.maxResults) };
}

interface TicketSlaCycles {
	firstResponse: SlaCycle | null;
	resolution: SlaCycle | null;
}

/**
 * Both configured metrics come from the same paginated JSM response, so the
 * escalation clock costs no extra request.
 */
async function fetchSlaCycles(
	issueKey: string,
	config: JiraConfig,
	fetchImpl: Fetch,
	sleep?: Sleep,
): Promise<TicketSlaCycles> {
	const found: TicketSlaCycles = { firstResponse: null, resolution: null };
	let start = 0;
	for (let page = 0; page < config.maxSlaPages; page += 1) {
		const url = new URL(
			`${config.baseUrl}/rest/servicedeskapi/request/${encodeURIComponent(issueKey)}/sla`,
		);
		url.searchParams.set('start', String(start));
		url.searchParams.set('limit', String(config.slaPageSize));

		let response: Response;
		try {
			response = await fetchOk(
				url.toString(),
				{ headers: jiraHeaders(config) },
				config.http,
				fetchImpl,
				sleep,
			);
		} catch (error) {
			if (error instanceof Error && error.message.includes('404')) return found;
			throw error;
		}

		const data = (await response.json()) as JiraSlaPage;
		found.firstResponse ??= findMetric(data, config.firstResponseSlaName);
		found.resolution ??= findMetric(data, config.resolutionSlaName);
		if (found.firstResponse && found.resolution) return found;
		if (data.isLastPage || !data.values?.length) return found;
		const nextStart = data.start + data.limit;
		if (!Number.isInteger(nextStart) || nextStart <= start) {
			throw new Error(`JSM SLA pagination did not advance for ${issueKey}`);
		}
		start = nextStart;
	}
	throw new Error(`JSM SLA pagination exceeded ${config.maxSlaPages} pages for ${issueKey}`);
}

function findMetric(page: JiraSlaPage, name: string): SlaCycle | null {
	const metric = page.values?.find(
		(value) => value.name.trim().toLowerCase() === name.toLowerCase(),
	);
	return metric ? toSlaCycle(metric) : null;
}

function toSlaCycle(metric: JiraSlaMetric): SlaCycle {
	const cycle = metric.ongoingCycle;
	if (!cycle) {
		return {
			name: metric.name,
			state: 'completed',
			breached: false,
			paused: false,
			withinCalendarHours: false,
			breachTimeEpochMillis: null,
			elapsedMinutes: null,
			remainingMinutes: null,
		};
	}
	return {
		name: metric.name,
		state: 'ongoing',
		breached: cycle.breached,
		paused: cycle.paused,
		withinCalendarHours: cycle.withinCalendarHours,
		breachTimeEpochMillis: cycle.breachTime?.epochMillis ?? null,
		elapsedMinutes: cycle.elapsedTime?.millis != null
			? Math.floor(cycle.elapsedTime.millis / 60_000)
			: null,
		remainingMinutes: cycle.remainingTime?.millis != null
			? Math.round(cycle.remainingTime.millis / 60_000)
			: null,
	};
}

function jiraHeaders(config: JiraConfig): Record<string, string> {
	const auth = Buffer.from(`${config.email}:${config.apiToken}`).toString('base64');
	return {
		Authorization: `Basic ${auth}`,
		'Content-Type': 'application/json',
		Accept: 'application/json',
	};
}

async function mapConcurrent<T, R>(
	values: T[],
	concurrency: number,
	mapper: (value: T) => Promise<R>,
): Promise<R[]> {
	const results = new Array<R>(values.length);
	let next = 0;
	async function worker(): Promise<void> {
		while (next < values.length) {
			const index = next;
			next += 1;
			results[index] = await mapper(values[index] as T);
		}
	}
	await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()));
	return results;
}

interface JiraUser {
	accountId?: string;
	displayName?: string;
	/** `atlassian` for vendor staff, `customer` for the client's portal users. */
	accountType?: string;
}

interface JiraIssue {
	key: string;
	fields: {
		summary?: string;
		status?: { name?: string };
		priority?: { name?: string };
		assignee?: { displayName?: string; accountId?: string };
		[customField: string]: unknown;
	};
}

interface JiraSearchResponse {
	issues?: JiraIssue[];
	nextPageToken?: string;
	isLast?: boolean;
}

interface JiraSlaPage {
	start: number;
	limit: number;
	isLastPage: boolean;
	values?: JiraSlaMetric[];
}

interface JiraSlaMetric {
	name: string;
	ongoingCycle?: {
		breached: boolean;
		paused: boolean;
		withinCalendarHours: boolean;
		breachTime?: { epochMillis?: number };
		elapsedTime?: { millis?: number };
		remainingTime?: { millis?: number };
	};
}
