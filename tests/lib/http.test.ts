import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fetchOk, MAX_RETRY_DELAY_MS } from '../../src/lib/http.ts';

test('retries rate limits using Retry-After', async () => {
	let calls = 0;
	const sleeps: number[] = [];
	const fetchImpl: typeof fetch = async () => {
		calls += 1;
		return calls === 1
			? new Response('', { status: 429, headers: { 'retry-after': '2' } })
			: Response.json({ ok: true });
	};

	const response = await fetchOk(
		'https://example.com',
		{},
		{ timeoutMs: 1_000, maxRetries: 1 },
		fetchImpl,
		async (milliseconds) => {
			sleeps.push(milliseconds);
		},
	);
	assert.equal(response.status, 200);
	assert.equal(calls, 2);
	assert.deepEqual(sleeps, [2_000]);
});

for (const [kind, retryAfter] of [
	['numeric', '999999'],
	['date', 'Wed, 31 Dec 9999 23:59:59 GMT'],
] as const) {
	test(`caps excessive ${kind} Retry-After values`, async () => {
		let calls = 0;
		const sleeps: number[] = [];
		const fetchImpl: typeof fetch = async () => {
			calls += 1;
			return calls === 1
				? new Response('', { status: 429, headers: { 'retry-after': retryAfter } })
				: Response.json({ ok: true });
		};

		await fetchOk(
			'https://example.com',
			{},
			{ timeoutMs: 1_000, maxRetries: 1 },
			fetchImpl,
			async (milliseconds) => {
				sleeps.push(milliseconds);
			},
		);
		assert.deepEqual(sleeps, [MAX_RETRY_DELAY_MS]);
	});
}

test('does not retry permanent failures', async () => {
	let calls = 0;
	const fetchImpl: typeof fetch = async () => {
		calls += 1;
		return new Response('', { status: 401, statusText: 'Unauthorized' });
	};

	await assert.rejects(
		fetchOk('https://example.com', {}, { timeoutMs: 1_000, maxRetries: 2 }, fetchImpl),
		/401 Unauthorized/,
	);
	assert.equal(calls, 1);
});

test('surfaces the final retryable failure', async () => {
	let calls = 0;
	const fetchImpl: typeof fetch = async () => {
		calls += 1;
		return new Response('', { status: 503, statusText: 'Unavailable' });
	};

	await assert.rejects(
		fetchOk(
			'https://example.com',
			{},
			{ timeoutMs: 1_000, maxRetries: 1 },
			fetchImpl,
			async () => {},
		),
		/503 Unavailable/,
	);
	assert.equal(calls, 2);
});

test('reports request timeouts without leaking response content', async () => {
	const fetchImpl: typeof fetch = async (_input, init) =>
		await new Promise<Response>((_resolve, reject) => {
			init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
		});

	await assert.rejects(
		fetchOk('https://example.com', {}, { timeoutMs: 1, maxRetries: 0 }, fetchImpl),
		/timed out after 1ms/,
	);
});
