import assert from 'node:assert/strict';
import { test } from 'node:test';
import type {
	DigestsObserved,
	DirectMessagesObserved,
	EscalationObserved,
} from '../../src/lib/run-journal.ts';
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
	withoutResolutionSla: 0,
	truncated: false,
	due: 2,
	ineligible: 5,
	suppressedOutsideCalendar: 2,
	waitingForNextWindow: 1,
};

test('cannot be handed a request key or a person as a map key', () => {
	// The module claims its event shapes are unable to express an identity. The
	// two map-shaped events are the only place that claim could fail, so it is
	// stated here as a type assertion: a Record<string, number> would accept a
	// ticket key or a name and still compile.
	const escalation: EscalationObserved['byLevel'] = { '3': 2 };
	const failures: DirectMessagesObserved['failures'] = { 'not-installed': 1 };
	assert.deepEqual(Object.keys(escalation), ['3']);
	assert.deepEqual(Object.keys(failures), ['not-installed']);

	// @ts-expect-error a request key is not a contractual level
	const leakedTicket: EscalationObserved['byLevel'] = { 'DC-885': 1 };
	// @ts-expect-error a person is not a delivery failure reason
	const leakedPerson: DirectMessagesObserved['failures'] = { 'Anar Tuvshinjargal': 1 };
	assert.ok(leakedTicket && leakedPerson, 'referenced so the assertions are not dead code');
});

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

test('reports digest provenance as counts, never prose or a request key', () => {
	const { emitted, sink: target } = sink();
	createRunJournal(target).digests({
		tickets: 4,
		model: 3,
		fallback: 1,
		reasons: { timeout: 1 },
	});

	assert.equal(emitted.length, 1);
	assert.equal(emitted[0]?.level, 'warn');
	assert.match(emitted[0]?.message ?? '', /Digested 4 request\(s\): 3 by the model, 1 deterministic \(timeout:1\)/);
	assert.equal(emitted[0]?.attributes?.model, 3);

	// @ts-expect-error a request key is not a digest reason
	const leaked: DigestsObserved['reasons'] = { 'DC-885': 1 };
	assert.ok(leaked, 'referenced so the assertion is not dead code');
});

test('the deterministic digest path is an ordinary run, not a degraded one', () => {
	const { emitted, sink: target } = sink();
	createRunJournal(target).digests({ tickets: 2, model: 0, fallback: 2, reasons: { disabled: 2 } });

	assert.equal(emitted[0]?.level, 'info');
});
