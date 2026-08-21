import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRunJournal, type JournalSink } from '../../src/lib/run-journal.ts';

interface Emitted {
	level: 'info' | 'warn';
	message: string;
	attributes?: Record<string, unknown>;
}

function sink(): { emitted: Emitted[]; sink: JournalSink } {
	const emitted: Emitted[] = [];
	return {
		emitted,
		sink: {
			info: (message, attributes) => emitted.push({ level: 'info', message, attributes }),
			warn: (message, attributes) => emitted.push({ level: 'warn', message, attributes }),
		},
	};
}

const COUNTERS = {
	scanned: 10,
	withoutSla: 0,
	truncated: false,
	due: 2,
	ineligible: 5,
	suppressedOutsideCalendar: 2,
	waitingForNextWindow: 1,
};

test('reports the selection counters as structured attributes', () => {
	const { emitted, sink: target } = sink();
	createRunJournal(target).selection(COUNTERS);

	assert.equal(emitted.length, 1);
	assert.equal(emitted[0]?.level, 'info');
	assert.equal(emitted[0]?.attributes?.scanned, 10);
	assert.equal(emitted[0]?.attributes?.ineligible, 5);
	assert.match(emitted[0]?.message ?? '', /Scanned 10; 2 due/);
});

test('separates a model-written intro from each fallback reason', () => {
	const { emitted, sink: target } = sink();
	const journal = createRunJournal(target);
	journal.intro({ source: 'model' });
	journal.intro({ source: 'fallback', reason: 'disabled' });
	journal.intro({ source: 'fallback', reason: 'error', errorName: 'FlueError' });

	assert.deepEqual(emitted.map((entry) => entry.level), ['info', 'info', 'warn']);
	assert.match(emitted[2]?.message ?? '', /fell back to the deterministic opener: error/);
	assert.equal(emitted[2]?.attributes?.errorName, 'FlueError');
});

test('warns on partial delivery and stays quiet on complete delivery', () => {
	const { emitted, sink: target } = sink();
	const journal = createRunJournal(target);
	journal.delivery({ dryRun: false, messages: 3, delivered: 3 });
	journal.delivery({ dryRun: false, messages: 3, delivered: 1 });
	journal.delivery({ messages: 3, dryRun: true });

	assert.deepEqual(emitted.map((entry) => entry.level), ['info', 'warn', 'info']);
	assert.match(emitted[1]?.message ?? '', /Delivered 1 of 3/);
	assert.match(emitted[2]?.message ?? '', /Dry run: skipped 3/);
});
