import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { JiraConfig } from './config.ts';
import { fetchTickets } from './jira.ts';

test('paginates Jira search and JSM SLA metrics', async () => {
	const searchTokens: Array<string | undefined> = [];
	const fetchImpl: typeof fetch = async (input, init) => {
		const url = String(input);
		if (url.endsWith('/rest/api/3/search/jql')) {
			const body = JSON.parse(String(init?.body)) as { nextPageToken?: string };
			searchTokens.push(body.nextPageToken);
			return body.nextPageToken
				? Response.json({ issues: [issue('SUP-2')], isLast: true })
				: Response.json({ issues: [issue('SUP-1')], isLast: false, nextPageToken: 'page-2' });
		}

		const parsed = new URL(url);
		if (url.includes('/SUP-1/sla') && parsed.searchParams.get('start') === '0') {
			return Response.json({ start: 0, limit: 1, isLastPage: false, values: [metric('Resolution')] });
		}
		if (url.includes('/SUP-1/sla')) {
			return Response.json({ start: 1, limit: 1, isLastPage: true, values: [metric('First response')] });
		}
		if (url.includes('/SUP-2/sla')) {
			return Response.json({
				start: 0,
				limit: 1,
				isLastPage: true,
				values: [{ name: 'First response', completedCycles: [{}] }],
			});
		}
		throw new Error(`Unexpected URL: ${url}`);
	};

	const result = await fetchTickets(config(), fetchImpl, async () => {});
	assert.deepEqual(searchTokens, [undefined, 'page-2']);
	assert.equal(result.scanned, 2);
	assert.equal(result.withoutSla, 0);
	assert.equal(result.tickets[0]?.firstResponseSla?.breached, true);
	assert.equal(result.tickets[1]?.firstResponseSla?.state, 'completed');
	assert.equal('assigneeEmail' in (result.tickets[0] ?? {}), false);
});

test('rejects SLA pagination that does not advance', async () => {
	const fetchImpl: typeof fetch = async (input) => {
		const url = String(input);
		if (url.endsWith('/rest/api/3/search/jql')) {
			return Response.json({ issues: [issue('SUP-1')], isLast: true });
		}
		return Response.json({ start: 0, limit: 0, isLastPage: false, values: [metric('Other')] });
	};

	await assert.rejects(fetchTickets(config(), fetchImpl, async () => {}), /did not advance/);
});

test('caps empty Jira search pages even when tokens remain unique', async () => {
	let page = 0;
	const fetchImpl: typeof fetch = async () => {
		page += 1;
		return Response.json({ issues: [], isLast: false, nextPageToken: `page-${page}` });
	};
	const limited = { ...config(), maxSearchPages: 2 };

	await assert.rejects(fetchTickets(limited, fetchImpl, async () => {}), /exceeded 2 pages/);
	assert.equal(page, 2);
});

function config(): JiraConfig {
	return {
		baseUrl: 'https://example.atlassian.net',
		email: 'support@example.com',
		apiToken: 'token',
		jql: 'project = SUP',
		pageSize: 1,
		maxResults: 10,
		maxSearchPages: 10,
		slaPageSize: 1,
		maxSlaPages: 10,
		slaConcurrency: 2,
		firstResponseSlaName: 'First response',
		http: { timeoutMs: 1_000, maxRetries: 0 },
	};
}

function issue(key: string) {
	return {
		key,
		fields: {
			summary: `Summary ${key}`,
			status: { name: 'Waiting for support' },
			priority: { name: 'High' },
			assignee: { displayName: 'Developer' },
		},
	};
}

function metric(name: string) {
	return {
		name,
		ongoingCycle: {
			breached: true,
			paused: false,
			withinCalendarHours: true,
			breachTime: { epochMillis: 1_722_500_000_000 },
		},
	};
}
