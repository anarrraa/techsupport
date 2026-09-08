import assert from 'node:assert/strict';
import test from 'node:test';
import { planDirectMessages } from '../../src/lib/direct-messages.ts';
import type { EscalationConfig } from '../../src/lib/escalation-config.ts';
import { planEscalation, type EscalationCandidate } from '../../src/lib/escalation.ts';
import type { JiraTicket, SlaCycle } from '../../src/lib/jira.ts';

const NOW = new Date('2026-09-07T04:00:00.000Z');
const DEV = '11111111-1111-4111-8111-111111111111';
const LEAD = '22222222-2222-4222-8222-222222222222';
const NOC = '33333333-3333-4333-8333-333333333333';

test('reminds the assignee directly with the contractual response window', () => {
	const plan = planDirectMessages({
		due: [ticket({ key: 'DC-1', priority: 'Highest' })],
		escalations: [],
		config: directory(),
		now: NOW,
		maxChars: 12_000,
	});

	assert.equal(plan.messages.length, 1);
	const [message] = plan.messages as [(typeof plan.messages)[number]];
	assert.equal(message.entraObjectId, DEV);
	assert.equal(message.level, 1);
	assert.deepEqual(message.records, []);
	const text = message.messages.join('\n');
	assert.match(text, /Сайн байна уу, Developer\./);
	assert.match(text, /DC-1/);
	assert.match(text, /гэрээний хугацаа 30 мин/);
});

test('reminds the participants, never the assignee', () => {
	// The assignee is the support team that triages a request; the participants
	// are who is expected to act on it.
	const plan = planDirectMessages({
		due: [
			ticket({
				key: 'DC-1',
				assignee: 'Support Triage',
				assigneeAccountId: 'jira-triage',
				participants: [{ accountId: 'jira-dev', displayName: 'Developer' }],
			}),
		],
		escalations: [],
		config: directory(),
		now: NOW,
		maxChars: 12_000,
	});

	assert.deepEqual(plan.messages.map((message) => message.entraObjectId), [DEV]);
	assert.equal(plan.unmappedRecipients, 0);
});

test('reminds every vendor participant on the request', () => {
	const plan = planDirectMessages({
		due: [
			ticket({
				key: 'DC-1',
				participants: [
					{ accountId: 'jira-dev', displayName: 'Developer' },
					{ accountId: 'jira-lead', displayName: 'Team Lead' },
				],
			}),
		],
		escalations: [],
		config: directory(),
		now: NOW,
		maxChars: 12_000,
	});
	assert.deepEqual(plan.messages.map((message) => message.entraObjectId).sort(), [DEV, LEAD].sort());
});

test('groups every breached request for one person into one direct message', () => {
	const plan = planDirectMessages({
		due: [ticket({ key: 'DC-1' }), ticket({ key: 'DC-2' })],
		escalations: [],
		config: directory(),
		now: NOW,
		maxChars: 12_000,
	});
	assert.equal(plan.messages.length, 1);
	const text = plan.messages[0]?.messages.join('\n') ?? '';
	assert.match(text, /DC-1/);
	assert.match(text, /DC-2/);
});

test('counts a breach with no participant the directory knows', () => {
	const plan = planDirectMessages({
		due: [ticket({ participants: [{ accountId: 'jira-newcomer', displayName: 'Newcomer' }] })],
		escalations: [],
		config: directory(),
		now: NOW,
		maxChars: 12_000,
	});
	assert.deepEqual(plan.messages, []);
	assert.equal(plan.unmappedRecipients, 1);
});

test('escalates to the configured contact and records the level to persist', () => {
	const plan = planDirectMessages({
		due: [],
		escalations: [candidate({ level: 3, withinCalendarHours: true })],
		config: directory(),
		now: NOW,
		maxChars: 12_000,
	});

	assert.equal(plan.messages.length, 1);
	const [message] = plan.messages as [(typeof plan.messages)[number]];
	assert.equal(message.entraObjectId, LEAD);
	assert.deepEqual(message.records, [{ ticketKey: 'DC-1', level: 3 }]);
	assert.match(message.messages.join('\n'), /Эскалаци — L3/);
});

test('notifies assignee and developer contact in parallel off-hours and names the on-call engineer', () => {
	const plan = planDirectMessages({
		due: [],
		escalations: [candidate({ level: 2, withinCalendarHours: false, priority: 'Highest' })],
		config: directory(),
		now: NOW,
		maxChars: 12_000,
	});

	assert.deepEqual(
		plan.messages.map((message) => [message.entraObjectId, message.level]),
		[[DEV, 1], [LEAD, 2]],
	);
	for (const message of plan.messages) {
		assert.match(message.messages.join('\n'), /дуудлагын инженер NOC On-call-тай утсаар холбогдоно уу/);
	}
	assert.equal(plan.missingOnCall, 0);
});

test('counts an off-hours escalation that cannot name an on-call contact', () => {
	const config = directory();
	delete config.onCall;
	const plan = planDirectMessages({
		due: [],
		escalations: [candidate({ level: 2, withinCalendarHours: false, priority: 'Highest' })],
		config,
		now: NOW,
		maxChars: 12_000,
	});
	assert.equal(plan.missingOnCall, 1);
	assert.doesNotMatch(plan.messages[0]?.messages.join('\n') ?? '', /дуудлагын инженер/);
});

test('withholds everyone outside the staged-rollout allowlist', () => {
	const plan = planDirectMessages({
		due: [ticket({ key: 'DC-1' })],
		escalations: [candidate({ level: 3, withinCalendarHours: true })],
		config: directory(),
		now: NOW,
		maxChars: 12_000,
		allowlist: [DEV],
	});

	assert.deepEqual(plan.messages.map((message) => message.entraObjectId), [DEV]);
	assert.equal(plan.suppressedByAllowlist, 1);
	// Withheld, not recorded: the level is still owed once the gate opens.
	assert.deepEqual(plan.messages.flatMap((message) => message.records), []);
});

test('names the allowlist by email, handle, or object id, in any case', () => {
	for (const entry of [DEV.toUpperCase(), 'dev', 'Dev@Example.Invalid']) {
		const plan = planDirectMessages({
			due: [ticket({ key: 'DC-1' })],
			escalations: [],
			config: directory(),
			now: NOW,
			maxChars: 12_000,
			allowlist: [entry],
		});
		assert.equal(plan.messages.length, 1, entry);
		assert.equal(plan.suppressedByAllowlist, 0, entry);
	}
});

test('names anyone in the allowlist who is not in the directory', () => {
	assert.throws(
		() =>
			planDirectMessages({
				due: [ticket()],
				escalations: [],
				config: directory(),
				now: NOW,
				maxChars: 12_000,
				allowlist: ['nobody@example.invalid'],
			}),
		/names nobody@example\.invalid, who are not in the escalation directory/,
	);
});

test('an off-hours escalation reaches the participants, not the vanished assignee', () => {
	// planEscalation puts level 1 in an off-hours Critical/High plan. That leg
	// used to resolve from assigneeAccountId, which stopped being an actionable
	// recipient when first-response reminders moved to the participants — so the
	// contract's "notify L1 and L2 together" reached only L2.
	const plan = planDirectMessages({
		due: [],
		escalations: [candidate({ level: 2, withinCalendarHours: false, priority: 'Highest' })],
		config: directory(),
		now: NOW,
		maxChars: 12_000,
	});

	assert.deepEqual(
		plan.messages.map((message) => [message.entraObjectId, message.kind, message.level]),
		[[DEV, 'escalation', 1], [LEAD, 'escalation', 2]],
	);
	assert.equal(plan.unmappedRecipients, 0);
	assert.equal(plan.incompleteEscalations.size, 0);
});

test('the level-1 leg of an escalation is not dressed as a first-response reminder', () => {
	const plan = planDirectMessages({
		due: [],
		escalations: [candidate({ level: 2, withinCalendarHours: false, priority: 'Highest' })],
		config: directory(),
		now: NOW,
		maxChars: 12_000,
	});
	const leg = plan.messages.find((message) => message.level === 1);
	const text = leg?.messages.join('\n') ?? '';
	assert.match(text, /Эскалаци — L1/);
	assert.doesNotMatch(text, /анхны хариу SLA хугацаа хэтэрсэн/);
	assert.doesNotMatch(text, /гэрээний хугацаа/);
});

test('a withheld leg stops its siblings from recording the level', () => {
	// Otherwise the delivered leg marks the level notified and the contact the
	// gate suppressed is never told — the rung is lost, not deferred.
	const plan = planDirectMessages({
		due: [],
		escalations: [candidate({ level: 2, withinCalendarHours: false, priority: 'Highest' })],
		config: directory(),
		now: NOW,
		maxChars: 12_000,
		allowlist: [DEV],
	});

	assert.deepEqual(plan.messages.map((message) => message.entraObjectId), [DEV]);
	assert.equal(plan.suppressedByAllowlist, 1);
	assert.ok(plan.incompleteEscalations.has('DC-1'), 'the request must be marked incomplete');
});

test('a first-response reminder and an escalation leg stay separate messages', () => {
	// Both are level 1 for the same person. Merging them put an escalation
	// ticket under the first-response clock.
	const plan = planDirectMessages({
		due: [ticket({ key: 'DC-2' })],
		escalations: [candidate({ level: 2, withinCalendarHours: false, priority: 'Highest' })],
		config: directory(),
		now: NOW,
		maxChars: 12_000,
	});

	const devMessages = plan.messages.filter((message) => message.entraObjectId === DEV);
	assert.deepEqual(devMessages.map((message) => message.kind).sort(), ['escalation', 'first-response']);
});

test('fails visibly when the crossed level has no contact configured', () => {
	assert.throws(
		() =>
			planDirectMessages({
				due: [],
				escalations: [candidate({ level: 5, withinCalendarHours: true })],
				config: directory(),
				now: NOW,
				maxChars: 12_000,
			}),
		/No L5 escalation contact configured for project DC/,
	);
});

function directory(): EscalationConfig {
	return {
		people: {
			dev: {
				name: 'Developer',
				email: 'dev@example.invalid',
				entraObjectId: DEV,
				jiraAccountId: 'jira-dev',
			},
			lead: { name: 'Team Lead', entraObjectId: LEAD, jiraAccountId: 'jira-lead' },
			noc: { name: 'NOC On-call', entraObjectId: NOC },
		},
		projects: { DC: { L2: 'lead', L3: 'lead', L4: 'lead' } },
		onCall: 'noc',
	};
}

function candidate(options: {
	level: 2 | 3 | 4 | 5;
	withinCalendarHours: boolean;
	priority?: string;
}): EscalationCandidate {
	const priority = options.priority ?? 'Medium';
	const severity = priority === 'Highest' ? 'critical' : 'medium';
	return {
		ticket: ticket({ key: 'DC-1', priority }),
		severity,
		level: options.level,
		plan: planEscalation(severity, options.level, options.withinCalendarHours),
	};
}

function ticket(overrides: Partial<JiraTicket> = {}): JiraTicket {
	return {
		key: 'DC-1',
		summary: 'Synthetic summary',
		status: 'In Progress',
		priority: 'Medium',
		assignee: 'Developer',
		assigneeAccountId: 'jira-dev',
		url: 'https://jira.invalid/browse/DC-1',
		firstResponseSla: cycle(),
		participants: [{ accountId: 'jira-dev', displayName: 'Developer' }],
		resolutionSla: cycle(),
		...overrides,
	};
}

function cycle(): SlaCycle {
	return {
		name: 'Synthetic',
		state: 'ongoing',
		breached: true,
		paused: false,
		withinCalendarHours: true,
		breachTimeEpochMillis: NOW.getTime() - 60 * 60_000,
		elapsedMinutes: 60,
		remainingMinutes: null,
	};
}
