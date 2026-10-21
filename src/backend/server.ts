import express from 'express';
import { generatePDF, generateExcel } from './export.ts';
// import { db, monthSnapshots } from './db.ts';

// No auth yet (docs/prd-monthly-dashboard.md): bound to localhost by default.
const port = Number(process.env.BACKEND_PORT ?? 3001);
const host = process.env.BACKEND_HOST ?? '127.0.0.1';

export const app = express();

app.get('/health', (_req, res) => {
	res.json({ status: 'ok', database: 'mock', message: 'Backend running, using sample data' });
});

app.get('/api/reports/:month', (req, res) => {
	// Transform backend schema to frontend schema
	const rawData = {
		month: req.params.month,
		snapshots: 4,
		tickets: 15,
		firstResponseBreached: 3,
		resolutionBreached: 2,
		firstResponseBreachRate: 0.2,
		resolutionBreachRate: 0.133,
		byPriority: {
			Highest: { tickets: 2, firstResponseBreached: 1, resolutionBreached: 0 },
			High: { tickets: 5, firstResponseBreached: 1, resolutionBreached: 1 },
			Medium: { tickets: 6, firstResponseBreached: 1, resolutionBreached: 1 },
			Low: { tickets: 2, firstResponseBreached: 0, resolutionBreached: 0 }
		}
	};

	// Adapter: convert byPriority object to array of PriorityBreakdown
	const PRIORITY_MAP = {
		Highest: 'critical',
		High: 'high',
		Medium: 'medium',
		Low: 'low'
	};

	const byPriority = Object.entries(rawData.byPriority)
		.map(([key, counts]) => ({
			priority: PRIORITY_MAP[key as keyof typeof PRIORITY_MAP] || key.toLowerCase(),
			tickets: counts.tickets,
			breaches: counts.firstResponseBreached,
			avgFirstResponseMinutes: null,
			goalMinutes: null
		}))
		.sort((a, b) => {
			const order = { critical: 0, high: 1, medium: 2, low: 3 };
			return (order[a.priority as keyof typeof order] ?? 99) - (order[b.priority as keyof typeof order] ?? 99);
		});

	res.json({
		month: rawData.month,
		generatedAt: new Date().toISOString(),
		summary: {
			tickets: { value: rawData.tickets, previous: null },
			breaches: { value: rawData.firstResponseBreached, previous: null },
			compliance: {
				value: rawData.firstResponseBreachRate !== null ? 1 - rawData.firstResponseBreachRate : null,
				previous: null
			},
			avgFirstResponseMinutes: { value: null, previous: null }
		},
		snapshots: rawData.snapshots,
		byPriority,
		team: [],
		trend: []
	});
});

app.get('/api/reports/:month/export', async (req, res) => {
	const { format } = req.query;
	const month = req.params.month;

	const reportData = {
		month,
		snapshots: 4,
		tickets: 15,
		firstResponseBreached: 3,
		resolutionBreached: 2,
		firstResponseBreachRate: 0.2,
		resolutionBreachRate: 0.133,
		byPriority: {
			critical: { tickets: 2, firstResponseBreached: 1, resolutionBreached: 0 },
			high: { tickets: 5, firstResponseBreached: 1, resolutionBreached: 1 },
			medium: { tickets: 6, firstResponseBreached: 1, resolutionBreached: 1 },
			low: { tickets: 2, firstResponseBreached: 0, resolutionBreached: 0 }
		}
	};

	try {
		if (format === 'pdf') {
			const pdf = await generatePDF(reportData);
			res.setHeader('Content-Type', 'application/pdf');
			res.setHeader('Content-Disposition', `attachment; filename="SLA-Report-${month}.pdf"`);
			res.send(pdf);
		} else if (format === 'excel') {
			const excel = await generateExcel(reportData);
			res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
			res.setHeader('Content-Disposition', `attachment; filename="SLA-Report-${month}.xlsx"`);
			res.send(excel);
		} else {
			res.status(400).json({ error: 'format must be "pdf" or "excel"' });
		}
	} catch (error) {
		console.error('Export error:', error);
		res.status(500).json({ error: 'Failed to generate export' });
	}
});

if (import.meta.main) {
	app.listen(port, host, () => console.log(`Backend listening on http://${host}:${port}`));
}
