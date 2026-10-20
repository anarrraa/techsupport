import express from 'express';
import { aggregateMonth, monthRange } from '../lib/queries/monthly-report.ts';
import { db, monthSnapshots } from './db.ts';

// No auth yet (docs/prd-monthly-dashboard.md): bound to localhost by default.
const port = Number(process.env.BACKEND_PORT ?? 3001);
const host = process.env.BACKEND_HOST ?? '127.0.0.1';

export const app = express();

app.get('/health', async (_req, res) => {
	try {
		await db().$queryRaw`SELECT 1`;
		res.json({ status: 'ok', database: 'up' });
	} catch {
		res.status(503).json({ status: 'degraded', database: 'down' });
	}
});

app.get('/api/reports/:month', async (req, res) => {
	const range = monthRange(req.params.month);
	if (!range) {
		res.status(400).json({ error: 'month must be YYYY-MM' });
		return;
	}
	res.json(aggregateMonth(req.params.month, await monthSnapshots(range.start, range.end)));
});

if (import.meta.main) {
	app.listen(port, host, () => console.log(`Backend listening on http://${host}:${port}`));
}
