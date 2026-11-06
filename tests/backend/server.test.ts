import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import ExcelJS from 'exceljs';
import { createApp, MAX_SUPPORT_ROWS } from '../../src/backend/server.ts';
import type { ClientConfig } from '../../src/support-report/support-report.ts';
import { DONT_KNOW, type ChatDeps, type RetrievedChunk } from '../../src/docs-chat/chat.ts';
import { MAX_MONTHLY_SNAPSHOTS, type SnapshotRow } from '../../src/monthly-report/monthly-report.ts';

interface ReportResponse {
	snapshots: number;
	summary: Record<string, { value: number | null }>;
	byPriority: { priority: string }[];
	team: unknown[];
	coverage: { capturedDays: number; lastCapturedAt: string | null };
	firstResponseMissing: number;
	resolutionMissing: number;
}

const row: SnapshotRow = {
	capturedAt: new Date('2026-10-02T00:00:00Z'), ticketKey: 'DEMO-1', priority: 'High', status: 'Open',
	firstResponseState: 'ongoing', firstResponseBreached: true, firstResponsePaused: false,
	firstResponseElapsed: 60, firstResponseRemaining: -15, resolutionState: null,
	resolutionBreached: null, resolutionPaused: null, resolutionElapsed: null, resolutionRemaining: null,
};

test('HTTP reports and exports use the latest database snapshot per ticket', async () => {
	const ranges: Date[][] = [];
	await withServer(createApp({ check: async () => {}, read: async (start, end) => {
		ranges.push([start, end]);
		return [row, { ...row, capturedAt: new Date('2026-10-03Z'), firstResponseBreached: false }];
	} }), async (url) => {
		const response = await fetch(`${url}/api/reports/2026-10`);
		assert.equal(response.status, 200);
		const report = await response.json() as ReportResponse;
		assert.equal(report.snapshots, 2);
		assert.equal(report.coverage.capturedDays, 2);
		assert.equal(report.coverage.lastCapturedAt, '2026-10-03T00:00:00.000Z');
		assert.equal(report.firstResponseMissing, 0);
		assert.equal(report.resolutionMissing, 1);
		assert.equal(report.summary.resolutionBreaches.value, 0);
		assert.equal(report.summary.tickets.value, 1);
		assert.equal(report.summary.breaches.value, 0);
		assert.equal(report.summary.compliance.value, 1);
		assert.equal(report.byPriority[0].priority, 'high');
		assert.deepEqual(report.team, []);
		assert.equal(ranges[0][0].toISOString(), '2026-10-01T00:00:00.000Z');
		assert.equal(ranges[0][1].toISOString(), '2026-11-01T00:00:00.000Z');
		const excel = await fetch(`${url}/api/reports/2026-10/export?format=excel`);
		assert.equal(excel.status, 200);
		const workbook = new ExcelJS.Workbook();
		await workbook.xlsx.load(await excel.arrayBuffer());
		const cells: string[] = [];
		workbook.eachSheet(sheet => sheet.eachRow(r => cells.push(JSON.stringify(r.values))));
		assert.ok(cells.some(v => v.includes('Observed tickets') && v.includes('1')));
		assert.ok(cells.some(v => v.includes('Captured UTC days') && v.includes('2')));
		assert.ok(cells.some(v => v.includes('Not complete contractual monthly compliance')));
		assert.ok(cells.some(v => v.includes('2026-10-03T00:00:00.000Z')));
		const pdf = await fetch(`${url}/api/reports/2026-10/export?format=pdf`);
		assert.equal(pdf.status, 200);
		const pdfBytes = Buffer.from(await pdf.arrayBuffer());
		assert.equal(pdfBytes.subarray(0, 4).toString(), '%PDF');
		assert.match(pdfBytes.toString(), /4e6f7420636f6d706c657465/); // PDFKit writes text as hex: 'Not complete'

	});
});

test('empty data is zero, malformed months are rejected before database access', async () => {
	let reads = 0;
	await withServer(createApp({ check: async () => {}, read: async () => { reads++; return []; } }), async url => {
		for (const path of ['/api/reports/2026-13', '/api/reports/bad/export?format=pdf', '/api/reports/2026-10/export?format=csv']) {
			assert.equal((await fetch(url + path)).status, 400);
		}
		assert.equal(reads, 0);
		const report = await (await fetch(`${url}/api/reports/2026-10`)).json() as ReportResponse;
		assert.equal(report.summary.tickets.value, 0);
		assert.equal(report.summary.compliance.value, null);
		assert.deepEqual(report.byPriority, []);
		assert.equal((await fetch(`${url}/health`)).status, 200);
	});
});

test('database failure returns 503 without leaking exception text or sample data', async () => {
	const fail = async () => { throw new Error('PRIVATE_DATABASE_DETAILS'); };
	await withServer(createApp({ check: fail, read: fail }), async url => {
		for (const path of ['/health', '/api/reports/2026-10', '/api/reports/2026-10/export?format=pdf']) {
			const response = await fetch(url + path);
			assert.equal(response.status, 503);
			assert.ok(!(await response.text()).includes('PRIVATE_DATABASE_DETAILS'));
		}
	});
});

async function withServer(app: ReturnType<typeof createApp>, run: (url: string) => Promise<void>) {
	const server = app.listen(0, '127.0.0.1');
	try {
		await once(server, 'listening');
		const address = server.address();
		assert.ok(address && typeof address !== 'string');
		await run(`http://127.0.0.1:${address.port}`);
	} finally {
		server.closeAllConnections();
		await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
	}
}


test('oversized monthly reads and exports fail visibly instead of reporting partial results', async () => {
	await withServer(createApp({ check: async () => {}, read: async () => Array(MAX_MONTHLY_SNAPSHOTS + 1).fill(row) }), async url => {
		for (const path of ['/api/reports/2026-10', '/api/reports/2026-10/export?format=excel']) {
			const response = await fetch(url + path);
			assert.equal(response.status, 413);
			assert.deepEqual(await response.json(), { error: 'Monthly report exceeds snapshot limit' });
		}
	});
});

const SUPPORT_CONFIG: ClientConfig = {
	client: 'Жишээ ХХК',
	groups: [{ name: 'Үндсэн', systems: ['App'] }, { name: "Бусад (O'Neil) систем", systems: '*rest' }],
	sections: { 'Доголдол': 'defects' },
};
const supportApp = () => createApp(undefined, async () => ({ demo: SUPPORT_CONFIG }));

async function supportXlsx(headers: string[], rows: unknown[][]): Promise<Buffer> {
	const workbook = new ExcelJS.Workbook();
	const sheet = workbook.addWorksheet('Jira');
	sheet.addRow(headers);
	for (const r of rows) sheet.addRow(r);
	return Buffer.from(await workbook.xlsx.writeBuffer());
}
const SUPPORT_HEADERS = ['Issue key', 'Summary', 'System', 'Priority', 'Request Type', 'Status', 'Created', 'Resolved at'];
const supportRow = ['X-1', 'Нэвтрэх алдаа', 'App', 'High', 'Доголдол', 'Resolved', new Date(Date.UTC(2026, 8, 2, 9)), new Date(Date.UTC(2026, 8, 3, 9))];
const post = (url: string, body: Buffer) => fetch(url, { method: 'POST', body, headers: { 'Content-Type': 'application/octet-stream' } });

test('support report configs list id, client and group names only', async () => {
	await withServer(supportApp(), async url => {
		const response = await fetch(`${url}/api/support-reports/configs`);
		assert.equal(response.status, 200);
		assert.deepEqual(await response.json(), [{ id: 'demo', client: 'Жишээ ХХК', groups: ['Үндсэн', "Бусад (O'Neil) систем"] }]);
	});
});

test('an uploaded xlsx suggests a period and renders one PDF per group as an attachment', async () => {
	const file = await supportXlsx(SUPPORT_HEADERS, [supportRow]);
	await withServer(supportApp(), async url => {
		const period = await post(`${url}/api/support-reports/period?filename=jira.xlsx`, file);
		assert.equal(period.status, 200);
		assert.deepEqual(await period.json(), { from: '2026-09', to: '2026-09' });
		const response = await post(`${url}/api/support-reports?config=demo&from=2026-09&to=2026-09&group=1&filename=jira.xlsx`, file);
		assert.equal(response.status, 200);
		assert.equal(response.headers.get('content-type'), 'application/pdf');
		const disposition = response.headers.get('content-disposition') ?? '';
		assert.match(disposition, /^attachment; filename="support-report-2026-09\.pdf"; filename\*=UTF-8''/);
		const encoded = disposition.split("''")[1];
		assert.doesNotMatch(encoded, /['()*]/); // RFC 5987 attr-char
		assert.equal(decodeURIComponent(encoded), "Бусад (O'Neil) систем 2026-09.pdf");
		assert.equal(Buffer.from(await response.arrayBuffer()).subarray(0, 5).toString(), '%PDF-');
	});
});

test('support report uploads reject bad input with a visible reason', async () => {
	const file = await supportXlsx(SUPPORT_HEADERS, [supportRow]);
	const base = '/api/support-reports?filename=jira.xlsx';
	await withServer(supportApp(), async url => {
		const missing = await post(`${url}${base}&config=demo&from=2026-09&to=2026-09&group=0`, await supportXlsx(['Issue key', 'Summary'], [['X-1', 'a']]));
		assert.equal(missing.status, 400);
		assert.match((await missing.json() as { error: string }).error, /Missing required columns/);
		const missingPeriod = await post(`${url}/api/support-reports/period?filename=jira.xlsx`, await supportXlsx(['Issue key', 'Summary'], [['X-1', 'a']]));
		assert.equal(missingPeriod.status, 400);
		assert.match((await missingPeriod.json() as { error: string }).error, /Missing required columns/);
		for (const query of ['config=Demo!&from=2026-09&to=2026-09&group=0', 'config=demo&from=2026-9&to=2026-09&group=0',
			'config=demo&from=2026-10&to=2026-09&group=0', 'config=demo&from=2026-09&to=2026-09&group=2',
			'config=demo&from=2026-09&to=2026-09&group=x', 'config=demo&from=2026-09&to=2026-09']) {
			const response = await post(`${url}${base}&${query}`, file);
			assert.equal(response.status, 400, query);
			assert.ok((await response.json() as { error: string }).error, query);
		}
		assert.equal((await post(`${url}${base}&config=nope&from=2026-09&to=2026-09&group=0`, file)).status, 404);
		assert.equal((await post(`${url}${base}&config=constructor&from=2026-09&to=2026-09&group=0`, file)).status, 404);
		const encoded = await fetch(`${url}/api/support-reports/period?filename=jira.xlsx`, { method: 'POST', body: file, headers: { 'Content-Encoding': 'bogus' } });
		assert.equal(encoded.status, 415);
		assert.equal((await post(`${url}/api/support-reports/period?filename=jira.xlsx`, Buffer.alloc(0))).status, 400);
		const big = await post(`${url}/api/support-reports/period?filename=jira.csv`, Buffer.alloc(10 * 1024 * 1024 + 1, 'a'));
		assert.equal(big.status, 413);
		assert.ok((await big.json() as { error: string }).error);
	});
});

test('support report uploads over the row cap fail visibly instead of rendering', async () => {
	const csv = SUPPORT_HEADERS.join(',') + '\n' + 'X-1,a,App,High,Доголдол,Open,2026-09-02 09:00,\n'.repeat(MAX_SUPPORT_ROWS + 1);
	await withServer(supportApp(), async url => {
		const response = await post(`${url}/api/support-reports/period?filename=jira.csv`, Buffer.from(csv));
		assert.equal(response.status, 413);
	});
});

test('server faults in support reports are 500 without echoing internal error text', async () => {
	const file = await supportXlsx(SUPPORT_HEADERS, [supportRow]);
	const broken = createApp(undefined, async () => ({ demo: { ...SUPPORT_CONFIG, sections: null as never } }));
	await withServer(broken, async url => {
		const response = await post(`${url}/api/support-reports?config=demo&from=2026-09&to=2026-09&group=0&filename=jira.xlsx`, file);
		assert.equal(response.status, 500);
		assert.deepEqual(await response.json(), { error: 'Internal error' });
	});
	await withServer(createApp(undefined, async () => { throw new Error('PRIVATE_PATH'); }), async url => {
		const response = await fetch(`${url}/api/support-reports/configs`);
		assert.equal(response.status, 500);
		assert.deepEqual(await response.json(), { error: 'Internal error' });
	});
});

const CHUNKS: RetrievedChunk[] = [
	{ path: 'documents/acme/billing/guide.md', heading: 'Guide › Refunds', content: 'SECRET_DOC_TEXT refunds take three days.' },
	{ path: 'documents/acme/billing/faq.md', heading: '', content: 'Other text.' },
];

function chatApp(chunks: RetrievedChunk[], overrides: Partial<ChatDeps> = {}) {
	const calls = { embedded: [] as string[], searched: [] as [string | undefined, number][], prompts: [] as { system: string; user: string }[] };
	const app = createApp(undefined, undefined, {
		embedQuery: async (q) => { calls.embedded.push(q); return [0.1, 0.2]; },
		search: async (_v, client, limit) => { calls.searched.push([client, limit]); return chunks; },
		answer: async (system, user) => { calls.prompts.push({ system, user }); return 'SECRET_ANSWER per [1].'; },
		clients: async () => ['acme', 'globex'],
		...overrides,
	});
	return { app, calls };
}

const ask = (url: string, body: unknown) => fetch(`${url}/api/chat`, {
	method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

test('chat rejects bad questions, locales and clients before embedding', async () => {
	const { app, calls } = chatApp(CHUNKS);
	await withServer(app, async (url) => {
		for (const body of [{ locale: 'en' }, { question: '   ', locale: 'en' }, { question: 'x'.repeat(1001), locale: 'en' },
			{ question: 'ok', locale: 'de' }, { question: 'ok', locale: 'en', client: '' }, { question: 'ok', locale: 'en', client: 5 }]) {
			assert.equal((await ask(url, body)).status, 400, JSON.stringify(body).slice(0, 60));
		}
		assert.equal((await ask(url, { question: ` ${'x'.repeat(1000)} `, locale: 'en' })).status, 200);
	});
	assert.equal(calls.embedded.length, 1);
	assert.equal(calls.embedded[0].length, 1000, 'question is trimmed');
});

test('chat with no retrieved chunks says it does not know without calling the model', async () => {
	const { app, calls } = chatApp([]);
	await withServer(app, async (url) => {
		assert.deepEqual(await (await ask(url, { question: 'q', locale: 'mn' })).json(), { answer: DONT_KNOW.mn, sources: [] });
		assert.deepEqual(await (await ask(url, { question: 'q', locale: 'en' })).json(), { answer: DONT_KNOW.en, sources: [] });
	});
	assert.equal(calls.prompts.length, 0);
});

test('chat answers from numbered chunks and returns exactly those as sources', async () => {
	const { app, calls } = chatApp(CHUNKS);
	await withServer(app, async (url) => {
		const response = await ask(url, { question: 'How long do refunds take?', locale: 'en', client: 'acme' });
		assert.equal(response.status, 200);
		assert.deepEqual(await response.json(), {
			answer: 'SECRET_ANSWER per [1].',
			sources: [{ path: CHUNKS[0].path, heading: CHUNKS[0].heading }, { path: CHUNKS[1].path, heading: '' }],
		});
		await ask(url, { question: 'q', locale: 'mn' });
	});
	assert.deepEqual(calls.searched, [['acme', 8], [undefined, 8]]);
	assert.match(calls.prompts[0].user, /<excerpt id="1" source="documents\/acme\/billing\/guide\.md › Guide › Refunds">\nSECRET_DOC_TEXT/);
	assert.match(calls.prompts[0].user, /<excerpt id="2" source="documents\/acme\/billing\/faq\.md">\n/);
	assert.match(calls.prompts[0].user, /<question>How long do refunds take\?<\/question>$/);
	assert.match(calls.prompts[0].system, /Answer in English/);
	assert.doesNotMatch(calls.prompts[0].system, /SECRET_DOC_TEXT/);
	assert.match(calls.prompts[1].system, /Answer in Mongolian/);
});

test('chat lists the indexed clients', async () => {
	await withServer(chatApp(CHUNKS).app, async (url) => {
		assert.deepEqual(await (await fetch(`${url}/api/chat/clients`)).json(), ['acme', 'globex']);
	});
});

test('chat logs carry status, latency and counts, never the question, documents or answer', async () => {
	const lines: string[] = [];
	const { log, error } = console;
	console.log = console.error = (...args: unknown[]) => { lines.push(args.join(' ')); };
	try {
		await withServer(chatApp(CHUNKS).app, async (url) => {
			assert.equal((await ask(url, { question: 'SECRET_QUESTION', locale: 'en' })).status, 200);
		});
		const failing = chatApp(CHUNKS, { answer: async () => { throw new Error('SECRET_DOC_TEXT in a provider error'); } }).app;
		await withServer(failing, async (url) => {
			const response = await ask(url, { question: 'SECRET_QUESTION', locale: 'en' });
			assert.equal(response.status, 500);
			assert.deepEqual(await response.json(), { error: 'Internal error' });
		});
	} finally {
		Object.assign(console, { log, error });
	}
	assert.ok(lines.some((l) => /^chat: 200 in \d+ms, 2 sources$/.test(l)), lines.join('|'));
	assert.ok(lines.some((l) => /^chat: failed in \d+ms$/.test(l)));
	assert.ok(!lines.join('\n').includes('SECRET'));
});

test('a model "don\'t know" lists no sources and out-of-range citations are dropped', async () => {
	await withServer(chatApp(CHUNKS, { answer: async () => DONT_KNOW.en }).app, async (url) => {
		assert.deepEqual(await (await ask(url, { question: 'q', locale: 'en' })).json(), { answer: DONT_KNOW.en, sources: [] });
	});
	await withServer(chatApp(CHUNKS, { answer: async () => 'Yes [1][2][3][0].' }).app, async (url) => {
		const body = await (await ask(url, { question: 'q', locale: 'en' })).json() as { answer: string; sources: unknown[] };
		assert.equal(body.answer, 'Yes [1][2].');
		assert.equal(body.sources.length, 2);
	});
});

test('chat body errors get chat messages, not upload ones', async () => {
	await withServer(chatApp(CHUNKS).app, async (url) => {
		const bad = await fetch(`${url}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
		assert.deepEqual([bad.status, await bad.json()], [400, { error: 'Invalid request body' }]);
		const big = await ask(url, { question: 'x'.repeat(20_000), locale: 'en' });
		assert.deepEqual([big.status, await big.json()], [413, { error: 'Request body too large' }]);
	});
});
