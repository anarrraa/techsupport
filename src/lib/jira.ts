import type { JiraConfig } from './config.ts';
import { fetchOk, type Fetch, type Sleep } from './http.ts';

export interface FirstResponseSla {
	name: string;
	state: 'ongoing' | 'completed';
	breached: boolean;
	paused: boolean;
	withinCalendarHours: boolean;
	breachTimeEpochMillis: number | null;
}

export interface JiraTicket {
	key: string;
	summary: string;
	status: string;
	priority: string;
	assignee: string;
	url: string;
	firstResponseSla: FirstResponseSla | null;
}

export interface JiraFetchResult {
	tickets: JiraTicket[];
	scanned: number;
	withoutSla: number;
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
		fetchFirstResponseSla(issue.key, config, fetchImpl, sleep),
	);

	const tickets = issues.values.map((issue, index): JiraTicket => ({
		key: issue.key,
		summary: issue.fields.summary ?? '(no title)',
		status: issue.fields.status?.name ?? 'Unknown',
		priority: issue.fields.priority?.name ?? 'None',
		assignee: issue.fields.assignee?.displayName ?? 'Unassigned',
		url: buildTicketUrl(ticketBaseUrl, issue.key),
		firstResponseSla: slas[index] ?? null,
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
		truncated: issues.truncated,
	};
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
					fields: ['summary', 'status', 'priority', 'assignee'],
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

async function fetchFirstResponseSla(
	issueKey: string,
	config: JiraConfig,
	fetchImpl: Fetch,
	sleep?: Sleep,
): Promise<FirstResponseSla | null> {
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
			if (error instanceof Error && error.message.includes('404')) return null;
			throw error;
		}

		const data = (await response.json()) as JiraSlaPage;
		const metric = data.values?.find(
			(value) => value.name.trim().toLowerCase() === config.firstResponseSlaName.toLowerCase(),
		);
		if (metric) return toFirstResponseSla(metric);
		if (data.isLastPage || !data.values?.length) return null;
		const nextStart = data.start + data.limit;
		if (!Number.isInteger(nextStart) || nextStart <= start) {
			throw new Error(`JSM SLA pagination did not advance for ${issueKey}`);
		}
		start = nextStart;
	}
	throw new Error(`JSM SLA pagination exceeded ${config.maxSlaPages} pages for ${issueKey}`);
}

function toFirstResponseSla(metric: JiraSlaMetric): FirstResponseSla {
	const cycle = metric.ongoingCycle;
	if (!cycle) {
		return {
			name: metric.name,
			state: 'completed',
			breached: false,
			paused: false,
			withinCalendarHours: false,
			breachTimeEpochMillis: null,
		};
	}
	return {
		name: metric.name,
		state: 'ongoing',
		breached: cycle.breached,
		paused: cycle.paused,
		withinCalendarHours: cycle.withinCalendarHours,
		breachTimeEpochMillis: cycle.breachTime?.epochMillis ?? null,
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

interface JiraIssue {
	key: string;
	fields: {
		summary?: string;
		status?: { name?: string };
		priority?: { name?: string };
		assignee?: { displayName?: string };
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
	};
}
