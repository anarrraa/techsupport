import assert from 'node:assert/strict';
import { test } from 'node:test';
import { postToChannel } from '../../src/lib/teams-webhook.ts';

test('posts the expected Teams text payload', async () => {
	let request: { url: string; init?: RequestInit } | undefined;
	const fetchImpl: typeof fetch = async (input, init) => {
		request = { url: String(input), init };
		return new Response('1');
	};

	await postToChannel(
		'Reminder text',
		'https://example.webhook.office.com/test',
		{ timeoutMs: 1_000, maxRetries: 0 },
		fetchImpl,
	);

	assert.equal(request?.url, 'https://example.webhook.office.com/test');
	assert.equal(request?.init?.method, 'POST');
	assert.deepEqual(JSON.parse(String(request?.init?.body)), { text: 'Reminder text' });
});
