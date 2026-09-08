import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
	highestNotified,
	readEscalationState,
	recordNotified,
	writeEscalationState,
} from '../../src/lib/escalation-state.ts';

test('treats a cache miss as nothing notified yet', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'escalation-state-'));
	assert.deepEqual(await readEscalationState(join(directory, 'absent.json')), {});
});

test('round-trips through a file the Actions cache can carry', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'escalation-state-'));
	const path = join(directory, 'nested', 'state.json');
	await writeEscalationState(path, { 'DC-1': 3 });
	assert.deepEqual(await readEscalationState(path), { 'DC-1': 3 });
});

test('never lowers a recorded level', () => {
	const state = {};
	recordNotified(state, 'DC-1', 3);
	recordNotified(state, 'DC-1', 2);
	assert.equal(highestNotified(state, 'DC-1'), 3);
	recordNotified(state, 'DC-1', 4);
	assert.equal(highestNotified(state, 'DC-1'), 4);
	assert.equal(highestNotified(state, 'DC-UNSEEN'), 0);
});

test('refuses a state file that is not a ticket-to-level map', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'escalation-state-'));
	const path = join(directory, 'state.json');
	await writeFile(path, JSON.stringify({ 'DC-1': 'three' }), 'utf8');
	await assert.rejects(readEscalationState(path), /not a ticket-to-level map/);
	await writeFile(path, JSON.stringify({ 'DC-1': 9 }), 'utf8');
	await assert.rejects(readEscalationState(path), /not a ticket-to-level map/);
});

test('writes only ticket keys and levels', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'escalation-state-'));
	const path = join(directory, 'state.json');
	await writeEscalationState(path, { 'DC-1': 2 });
	assert.equal(await readFile(path, 'utf8'), '{\n\t"DC-1": 2\n}\n');
});
