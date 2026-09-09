import assert from 'node:assert/strict';
import test from 'node:test';
import { parseWindows, windowDecision } from '../../src/lib/delivery-windows.ts';

const POLICY = {
	windows: parseWindows('09:00-12:00,14:00-18:00'),
	timeZone: 'Asia/Ulaanbaatar',
};

/** Ulaanbaatar is UTC+8 with no daylight saving, so local hour = UTC hour + 8. */
const at = (utc: string) => new Date(utc);

test('reads the windows the team asked for', () => {
	assert.deepEqual(parseWindows('09:00-12:00,14:00-18:00'), [
		{ startMinutes: 540, endMinutes: 720 },
		{ startMinutes: 840, endMinutes: 1_080 },
	]);
	assert.deepEqual(parseWindows(' 09:30-10:00 '), [{ startMinutes: 570, endMinutes: 600 }]);
});

test('rejects a window that cannot be honoured', () => {
	assert.throws(() => parseWindows('12:00-09:00'), /end after the start/);
	assert.throws(() => parseWindows('9-12'), /HH:MM-HH:MM/);
	assert.throws(() => parseWindows('25:00-26:00'), /HH:MM-HH:MM/);
	assert.throws(() => parseWindows(''), /at least one window/);
});

test('delivers inside a window and stays silent outside one', () => {
	// GitHub started past runs of this workflow 45 to 489 minutes late, so what
	// matters is not when the run begins but whether it is allowed to deliver.
	const cases: Array<[string, boolean, string]> = [
		['2026-09-09T01:00:00Z', true, '09:00 — window opens'],
		['2026-09-09T03:59:00Z', true, '11:59 — last minute of the morning window'],
		['2026-09-09T04:00:00Z', false, '12:00 — window is exclusive at the end'],
		['2026-09-09T05:00:00Z', false, '13:00 — lunch'],
		['2026-09-09T06:00:00Z', true, '14:00 — afternoon window opens'],
		['2026-09-09T09:59:00Z', true, '17:59 — last minute of the afternoon'],
		['2026-09-09T10:00:00Z', false, '18:00 — day over'],
		['2026-09-08T19:00:00Z', false, '03:00 — the run GitHub delayed into the night'],
	];
	for (const [utc, deliver, label] of cases) {
		assert.equal(windowDecision(at(utc), POLICY).deliver, deliver, label);
	}
});

test('never delivers at the weekend, whatever the hour', () => {
	// 2026-09-12 is a Saturday and 2026-09-13 a Sunday in Ulaanbaatar.
	for (const utc of ['2026-09-12T02:00:00Z', '2026-09-13T07:00:00Z']) {
		const decision = windowDecision(at(utc), POLICY);
		assert.equal(decision.deliver, false, utc);
		assert.equal(decision.reason, 'weekend');
	}
});

test('reports the local clock and the reason, and nothing else', () => {
	const decision = windowDecision(at('2026-09-09T01:23:00Z'), POLICY);
	assert.deepEqual(decision, { deliver: true, localTime: '09:23', reason: 'inside-window' });
});

test('reads the zone from the policy rather than assuming an offset', () => {
	// The same instant is inside the window in Ulaanbaatar and outside it in UTC.
	const instant = at('2026-09-09T01:00:00Z');
	assert.equal(windowDecision(instant, POLICY).deliver, true);
	assert.equal(
		windowDecision(instant, { ...POLICY, timeZone: 'UTC' }).deliver,
		false,
		'01:00 UTC is nobody\'s working hour',
	);
});
