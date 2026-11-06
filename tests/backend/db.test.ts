import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { captureSnapshot, db, disconnect } from '../../src/backend/db.ts';
import { createApp } from '../../src/backend/server.ts';
import type { JiraTicket } from '../../src/lib/jira.ts';

// Explicit opt-in to a disposable database; never use a developer's DATABASE_URL.
test('Postgres snapshot capture is idempotent and the HTTP report reads it', {
	skip: !process.env.TEST_DATABASE_URL,
}, async () => {
	const previous = process.env.DATABASE_URL;
	process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
	const capturedAt = new Date('2026-10-12T00:00:00Z');
	const ticket: JiraTicket = {
		key: `DEMO-${Date.now()}`, summary: 'Must not be stored', status: 'Open', priority: 'High',
		assignee: 'Must not be stored', assigneeAccountId: null, participants: [], comments: [],
		url: 'https://example.invalid', resolutionSla: null,
		firstResponseSla: { name: 'Time to first response', state: 'ongoing', breached: true,
			paused: false, withinCalendarHours: true, elapsedMinutes: 60, remainingMinutes: -15,
			breachTimeEpochMillis: null },
	};
	const server = createApp().listen(0, '127.0.0.1');
	try {
		await once(server, 'listening');
		assert.equal(await captureSnapshot([ticket], capturedAt), 1);
		assert.equal(await captureSnapshot([ticket], capturedAt), 0);
		const stored = await db().sLASnapshot.findFirstOrThrow({ where: { ticketKey: ticket.key } });
		assert.equal(stored.firstResponseRemaining, -15);
		assert.ok(!('summary' in stored));
		const address = server.address();
		assert.ok(address && typeof address !== 'string');
		const base = `http://127.0.0.1:${address.port}`;
		assert.equal((await fetch(`${base}/health`)).status, 200);
		const response = await fetch(`${base}/api/reports/2026-10`);
		assert.equal(response.status, 200);
		const report = await response.json() as { summary: { tickets: { value: number }; breaches: { value: number } } };
		assert.ok(report.summary.tickets.value >= 1);
		assert.ok(report.summary.breaches.value >= 1);
	} finally {
		server.closeAllConnections();
		await new Promise<void>(resolve => server.close(() => resolve()));
		try { await db().sLASnapshot.deleteMany({ where: { ticketKey: ticket.key } }); }
		finally {
			await disconnect();
			if (previous === undefined) delete process.env.DATABASE_URL;
			else process.env.DATABASE_URL = previous;
		}
	}
});
