import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateReminderIntro, type AggregateCounts } from '../../src/lib/reminder-intro.ts';

const COUNTS: AggregateCounts = {
	ticketCount: 3,
	developerCount: 2,
	priorities: { Highest: 1, Medium: 2 },
};

test('reports disabled without calling the model', async () => {
	let called = false;
	const result = await generateReminderIntro(COUNTS, {
		enabled: false,
		timeoutMs: 1_000,
		generate: async () => {
			called = true;
			return 'unused';
		},
	});

	assert.deepEqual(result, { source: 'fallback', reason: 'disabled' });
	assert.equal(called, false);
});

test('reports an unavailable generator', async () => {
	const result = await generateReminderIntro(COUNTS, { enabled: true, timeoutMs: 1_000 });
	assert.deepEqual(result, { source: 'fallback', reason: 'unavailable' });
});

test('sends aggregate counts only and returns the model line unescaped', async () => {
	let input = '';
	const result = await generateReminderIntro(COUNTS, {
		enabled: true,
		timeoutMs: 1_000,
		generate: async (value) => {
			input = value;
			return 'Сануулга *чухал*';
		},
	});

	assert.deepEqual(JSON.parse(input), {
		ticketCount: 3,
		developerCount: 2,
		priorities: { Highest: 1, Medium: 2 },
	});
	assert.deepEqual(Object.keys(JSON.parse(input)).sort(), [
		'developerCount',
		'priorities',
		'ticketCount',
	]);
	assert.equal(result.source, 'model');
	assert.equal(result.text, 'Сануулга *чухал*');
});

test('treats a blank or control-only response as empty', async () => {
	for (const response of ['', '   ', '\n\t']) {
		const result = await generateReminderIntro(COUNTS, {
			enabled: true,
			timeoutMs: 1_000,
			generate: async () => response,
		});
		assert.deepEqual(result, { source: 'fallback', reason: 'empty' }, JSON.stringify(response));
	}
});

test('reports a failure by error name without leaking the message', async () => {
	const result = await generateReminderIntro(COUNTS, {
		enabled: true,
		timeoutMs: 1_000,
		generate: async () => {
			throw new Error('PRIVATE-42 Confidential customer summary');
		},
	});

	assert.equal(result.source, 'fallback');
	assert.equal(result.reason, 'error');
	assert.equal(result.errorName, 'Error');
	assert.doesNotMatch(JSON.stringify(result), /PRIVATE-42|Confidential/);
});

test('cancels a stalled generator and reports a timeout', async () => {
	let aborted = false;
	const startedAt = Date.now();
	const result = await generateReminderIntro(COUNTS, {
		enabled: true,
		timeoutMs: 10,
		generate: (_input, signal) => new Promise((_resolve, reject) => {
			const handle = setInterval(() => {}, 1_000);
			signal.addEventListener('abort', () => {
				aborted = true;
				clearInterval(handle);
				reject(signal.reason);
			}, { once: true });
		}),
	});

	assert.equal(aborted, true);
	assert.equal(result.source, 'fallback');
	assert.equal(result.reason, 'timeout');
	assert.equal(result.errorName, 'TimeoutError');
	assert.ok(Date.now() - startedAt < 500);
});
