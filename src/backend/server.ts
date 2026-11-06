import express from 'express';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { generatePDF, generateExcel } from './export.ts';
import { db, monthSnapshots } from './db.ts';
import { aggregateMonth, monthRange, MonthlyReportLimitError, type SnapshotRow } from '../lib/queries/monthly-report.ts';
import { assertSupportRows, buildSupportReport, suggestPeriod, SupportInputError, type ClientConfig } from '../lib/support-report.ts';
import { readRows } from './support-report-input.ts';
import { renderSupportReportPdf } from './support-report-pdf.ts';

interface ReportStore {
	check(): Promise<unknown>;
	read(start: Date, end: Date): Promise<SnapshotRow[]>;
}

export const MAX_SUPPORT_ROWS = 20_000;
const SUPPORT_CONFIG_DIR = 'config/support-report';
const MONTH = /^\d{4}-\d{2}$/;

/** Local, gitignored client configs: `config/support-report/<id>.json`, read per request. A broken file fails visibly. */
async function readSupportConfigs(): Promise<Record<string, ClientConfig>> {
	const files = await readdir(SUPPORT_CONFIG_DIR).catch((error) => {
		if (error.code === 'ENOENT') return [];
		throw error;
	});
	return Object.fromEntries(await Promise.all(files.filter((f) => /^[a-z0-9-]+\.json$/.test(f)).map(async (f) => {
		const config = JSON.parse(await readFile(join(SUPPORT_CONFIG_DIR, f), 'utf8')) as ClientConfig;
		if (typeof config.client !== 'string' || !Array.isArray(config.groups) || !config.groups.length || typeof config.sections !== 'object') {
			throw new Error(`Invalid support report config ${f}: needs client, groups and sections`);
		}
		return [f.slice(0, -5), config];
	})));
}

class HttpError extends Error {
	readonly status: number;
	constructor(status: number, message: string) { super(message); this.status = status; }
}

// RFC 5987 attr-char excludes ' ( ) * which encodeURIComponent leaves as-is.
const rfc5987 = (value: string) => encodeURIComponent(value).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

// Parse the uploaded export in memory; nothing is stored. The file is the user's own, so read errors are shown.
async function uploadedRows(req: express.Request) {
	if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw new HttpError(400, 'Upload an .xlsx or .csv file');
	let rows;
	try {
		rows = await readRows(req.body, String(req.query.filename ?? ''));
	} catch (error) {
		throw new HttpError(400, error instanceof Error ? error.message : 'Could not read the file');
	}
	if (rows.length > MAX_SUPPORT_ROWS) throw new HttpError(413, `The file has more than ${MAX_SUPPORT_ROWS} rows`);
	assertSupportRows(rows);
	return rows;
}

// Both transports use the same monthly snapshot aggregation. No sample fallback.
export function createApp(store: ReportStore = {
	check: () => db().$queryRaw`SELECT 1`,
	read: monthSnapshots,
}, supportConfigs: () => Promise<Record<string, ClientConfig>> = readSupportConfigs) {
	const app = express();
	const upload = express.raw({ type: () => true, limit: '10mb' });

	app.get('/api/support-reports/configs', async (_req, res, next) => {
		try {
			res.json(Object.entries(await supportConfigs()).map(([id, c]) => ({ id, client: c.client, groups: c.groups.map((g) => g.name) })));
		} catch (error) { next(error); }
	});

	app.post('/api/support-reports/period', upload, async (req, res, next) => {
		try { res.json(suggestPeriod(await uploadedRows(req))); } catch (error) { next(error); }
	});

	app.post('/api/support-reports', upload, async (req, res, next) => {
		try {
			const { config: id, from, to, group } = req.query;
			if (typeof id !== 'string' || !/^[a-z0-9-]+$/.test(id)) throw new HttpError(400, 'config must match [a-z0-9-]+');
			if (typeof from !== 'string' || typeof to !== 'string' || !MONTH.test(from) || !MONTH.test(to) || from > to) {
				throw new HttpError(400, 'from and to must be YYYY-MM with from <= to');
			}
			const configs = await supportConfigs();
			const config = Object.hasOwn(configs, id) ? configs[id] : undefined;
			if (!config) throw new HttpError(404, `Unknown config: ${id}`);
			const index = Number(group);
			if (typeof group !== 'string' || !/^\d+$/.test(group) || index >= config.groups.length) {
				throw new HttpError(400, `group must be an index from 0 to ${config.groups.length - 1}`);
			}
			const rows = await uploadedRows(req);
			const period = { from, to };
			const built = buildSupportReport(rows, config, period)[index];
			const pdf = await renderSupportReportPdf(built, config, period, new Date());
			const label = from === to ? from : `${from}_${to}`;
			res.setHeader('Content-Type', 'application/pdf');
			res.setHeader('Content-Disposition', `attachment; filename="support-report-${label}.pdf"; filename*=UTF-8''${rfc5987(`${built.group} ${label}.pdf`)}`);
			res.send(pdf);
		} catch (error) { next(error); }
	});

	app.get('/health', async (_req, res) => {
		try {
			await store.check();
			res.json({ status: 'ok', database: 'connected' });
		} catch {
			res.status(503).json({ status: 'unavailable', database: 'unavailable' });
		}
	});

	app.get(['/api/reports/:month', '/api/reports/:month/export'], async (req, res) => {
		const month = String(req.params.month);
		const range = monthRange(month);
		if (!range) {
			res.status(400).json({ error: 'month must be YYYY-MM' });
			return;
		}
		const exporting = req.path.endsWith('/export');
		const format = req.query.format;
		if (exporting && format !== 'pdf' && format !== 'excel') {
			res.status(400).json({ error: 'format must be "pdf" or "excel"' });
			return;
		}
		let report;
		try {
			report = aggregateMonth(month, await store.read(range.start, range.end));
		} catch (error) {
			if (error instanceof MonthlyReportLimitError) {
				res.status(413).json({ error: 'Monthly report exceeds snapshot limit' });
				return;
			}
			res.status(503).json({ error: 'Report database unavailable' });
			return;
		}
		if (exporting) {
			try {
				const pdf = format === 'pdf';
				const file = pdf ? await generatePDF(report) : await generateExcel(report);
				res.setHeader('Content-Type', pdf ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
				res.setHeader('Content-Disposition', `attachment; filename="SLA-Report-${month}.${pdf ? 'pdf' : 'xlsx'}"`);
				res.send(file);
			} catch {
				res.status(500).json({ error: 'Failed to generate export' });
			}
			return;
		}
		const priorityMap: Record<string, string> = { Highest: 'critical', High: 'high', Medium: 'medium', Low: 'low', Lowest: 'low' };
		const order = ['critical', 'high', 'medium', 'low'];
		const buckets = new Map<string, { tickets: number; firstResponseBreached: number; resolutionBreached: number }>();
		for (const [name, counts] of Object.entries(report.byPriority)) {
			const priority = priorityMap[name];
			if (!priority) continue; // Unknown schemes still count in totals.
			const bucket = buckets.get(priority) ?? { tickets: 0, firstResponseBreached: 0, resolutionBreached: 0 };
			bucket.tickets += counts.tickets;
			bucket.firstResponseBreached += counts.firstResponseBreached;
			bucket.resolutionBreached += counts.resolutionBreached;
			buckets.set(priority, bucket);
		}

		res.json({
			...report,
			generatedAt: new Date().toISOString(),
			summary: {
				tickets: { value: report.tickets, previous: null },
				breaches: { value: report.firstResponseBreached, previous: null },
				resolutionBreaches: { value: report.resolutionBreached, previous: null },
				compliance: { value: report.firstResponseBreachRate === null ? null : 1 - report.firstResponseBreachRate, previous: null },
				avgFirstResponseMinutes: { value: null, previous: null },
			},
			priorityTotals: report.byPriority,
			byPriority: order.flatMap(priority => {
				const counts = buckets.get(priority);
				return counts ? [{ priority, ...counts, breaches: counts.firstResponseBreached,
					avgFirstResponseMinutes: null, goalMinutes: null }] : [];
			}),
			team: [], trend: [],
		});
	});
	// JSON errors, logging the status only. Known input problems and body-parser 4xx (size, encoding) are the client's;
	// anything else is a server fault whose details are never echoed.
	app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
		const parserStatus = Number((error as { status?: unknown } | null)?.status);
		const [status, message] = error instanceof HttpError ? [error.status, error.message]
			: error instanceof SupportInputError ? [400, error.message]
			: parserStatus === 413 ? [413, 'The file is larger than 10 MB']
			: parserStatus >= 400 && parserStatus < 500 ? [parserStatus, 'The upload could not be read']
			: [500, 'Internal error'];
		console.error(`request failed: ${status}`);
		res.status(status).json({ error: message });
	});
	return app;
}

export const app = createApp();

if (import.meta.main) {
	// No authentication: keep the API on localhost until authorization exists.
	const port = Number(process.env.BACKEND_PORT ?? 3001);
	const host = process.env.BACKEND_HOST ?? '127.0.0.1';
	app.listen(port, host, () => console.log(`Backend listening on http://${host}:${port}`));
}
