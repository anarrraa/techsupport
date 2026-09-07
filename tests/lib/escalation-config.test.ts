import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
	contactFor,
	loadEscalationConfig,
	onCallContact,
	personForJiraAccount,
	projectKeyOf,
} from '../../src/lib/escalation-config.ts';

const LEAD = '2f1a6c58-0b1f-4e6a-9f37-7d2c5a4b1e90';
const CTO = '6b7d1e42-3c58-4a91-8f0d-1e2a3b4c5d6e';
const NOC = 'aa11bb22-cc33-4d44-8e55-ff6677889900';

const VALID = {
	people: {
		lead: { name: 'Team Lead', entraObjectId: LEAD, jiraAccountId: 'jira-lead' },
		cto: { name: 'CTO', entraObjectId: CTO },
		noc: { name: 'NOC On-call', entraObjectId: NOC },
	},
	projects: { DC: { L3: 'lead', L4: 'cto' } },
	onCall: 'noc',
};

test('splits a ticket key into its project key', () => {
	assert.equal(projectKeyOf('DC-844'), 'DC');
	assert.equal(projectKeyOf('MULTI-PART-12'), 'MULTI-PART');
	assert.equal(projectKeyOf('NOKEY'), 'NOKEY');
});

test('loads a valid directory and resolves people both ways', async () => {
	const config = await write(VALID);
	assert.equal(personForJiraAccount(config, 'jira-lead')?.name, 'Team Lead');
	assert.equal(personForJiraAccount(config, 'jira-unknown'), null);
	assert.equal(personForJiraAccount(config, null), null);
	assert.equal(contactFor(config, 'DC', 3).entraObjectId, LEAD);
	assert.equal(contactFor(config, 'DC', 4).entraObjectId, CTO);
	assert.equal(onCallContact(config)?.name, 'NOC On-call');
});

test('fails visibly rather than guessing a missing escalation contact', async () => {
	const config = await write(VALID);
	assert.throws(() => contactFor(config, 'DC', 5), /No L5 escalation contact configured for project DC/);
	assert.throws(() => contactFor(config, 'OTHER', 3), /No L3 escalation contact configured for project OTHER/);
});

test('rejects a level pointing at someone who is not in the directory', async () => {
	await assert.rejects(
		write({ ...VALID, projects: { DC: { L3: 'ghost' } } }),
		/project DC L3 names unknown person "ghost"/,
	);
	await assert.rejects(write({ ...VALID, onCall: 'ghost' }), /onCall names unknown person "ghost"/);
});

test('rejects an identifier that Teams cannot use for a direct message', async () => {
	await assert.rejects(
		write({
			people: { lead: { name: 'Team Lead', entraObjectId: 'lead@example.invalid' } },
			projects: {},
		}),
		/must be a Microsoft Entra object id/,
	);
});

test('rejects the placeholder object id the example file ships', async () => {
	await assert.rejects(
		write({
			people: {
				lead: { name: 'Team Lead', entraObjectId: '00000000-0000-0000-0000-000000000000' },
			},
			projects: {},
		}),
		/is still the placeholder from the example file/,
	);
});

test('reports an unreadable or malformed file by path', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'escalation-'));
	await assert.rejects(
		loadEscalationConfig(join(directory, 'absent.json')),
		/Escalation config file not readable at/,
	);
	const broken = join(directory, 'broken.json');
	await writeFile(broken, '{not json', 'utf8');
	await assert.rejects(loadEscalationConfig(broken), /is not valid JSON/);
});

async function write(value: unknown) {
	const directory = await mkdtemp(join(tmpdir(), 'escalation-'));
	const path = join(directory, 'escalation.json');
	await writeFile(path, JSON.stringify(value), 'utf8');
	return loadEscalationConfig(path);
}
