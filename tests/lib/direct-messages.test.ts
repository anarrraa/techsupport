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

test('counts a breach whose assignee is absent from the directory', () => {
	const plan = planDirectMessages({
		due: [ticket({ assigneeAccountId: 'jira-newcomer' })],
		escalations: [],
		config: directory(),
		now: NOW,
		maxChars: 12_000,
	});
	assert.deepEqual(plan.messages, []);
	assert.equal(plan.unmappedAssignees, 1);
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

test('matches allowlist object ids regardless of case', () => {
	const plan = planDirectMessages({
		due: [ticket({ key: 'DC-1' })],
		escalations: [],
		config: directory(),
		now: NOW,
		maxChars: 12_000,
		allowlist: [DEV.toUpperCase()],
	});
	assert.equal(plan.messages.length, 1);
	assert.equal(plan.suppressedByAllowlist, 0);
});

test('rejects an allowlist id that nobody in the directory has', () => {
	assert.throws(
		() =>
			planDirectMessages({
				due: [ticket()],
				escalations: [],
				config: directory(),
				now: NOW,
				maxChars: 12_000,
				allowlist: ['99999999-9999-4999-8999-999999999999'],
			}),
		/1 object id\(s\) that no one in the escalation directory has/,
	);
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
			dev: { name: 'Developer', entraObjectId: DEV, jiraAccountId: 'jira-dev' },
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
	};
}
