import assert from 'node:assert/strict';
import test from 'node:test';
import { archiveMonths, askChat, fetchChatClients, fetchReport, fetchExport, fetchSupportConfigs, fetchSupportPeriod, fetchSupportReport, loadArchive, ReportRequestError, supportErrorText } from '../../../src/shared/utils/report-requests.ts';
import type { MonthlyReport } from '../../../src/types/report.ts';

test('archive reads exactly 12 UTC months newest first across a year boundary', () => {
  const months = archiveMonths(new Date('2026-01-01T00:00:00Z'));
  assert.equal(months.length, 12);
  assert.equal(months[0], '2026-01');
  assert.equal(months[11], '2025-02');
});

test('report and export request the selected month with timeout signals', async () => {
  const calls: string[] = [];
  const fetcher = (async (url, init) => {
    calls.push(String(url));
    assert.ok(init?.signal instanceof AbortSignal);
    return new Response('{}', { status: 200 });
  }) as typeof fetch;
  await fetchReport('2026-09', fetcher);
  await fetchExport('2026-09', 'excel', fetcher);
  assert.deepEqual(calls, ['/api/reports/2026-09', '/api/reports/2026-09/export?format=excel']);
});

test('HTTP failures are rejected for reports and downloads without echoing private response bodies', async () => {
  const fail = (async () => new Response('PRIVATE_CONNECTION_DETAILS', { status: 413 })) as typeof fetch;
  for (const run of [() => fetchReport('2026-10', fail), () => fetchExport('2026-10', 'pdf', fail)]) {
    await assert.rejects(run, error => error instanceof ReportRequestError && error.status === 413 && !error.message.includes('PRIVATE'));
  }
});

test('archive excludes empty months and fails as a whole if a read fails, allowing retry', async () => {
  let reads = 0;
  const load = async (month: string) => {
    reads++;
    return { month, snapshots: month === '2026-09' ? 1 : 0 } as MonthlyReport;
  };
  const now = new Date('2026-10-02T00:00:00Z');
  assert.deepEqual((await loadArchive(load, now)).map(r => r.month), ['2026-09']);
  assert.equal(reads, 12);
  await assert.rejects(loadArchive(async () => { throw new Error('network'); }, now));
  assert.equal((await loadArchive(load, now)).length, 1);
});

test('support report requests send the raw file with the chosen config, period and group', async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetcher = (async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith('/configs')) return Response.json([{ id: 'demo', client: 'Demo', groups: ['A', 'B'] }]);
    if (String(url).includes('/period')) return Response.json({ from: '2026-09', to: '2026-09' });
    return new Response('%PDF-', { headers: { 'Content-Disposition': `attachment; filename="support-report-2026-09.pdf"; filename*=UTF-8''${encodeURIComponent('Бусад 2026-09.pdf')}` } });
  }) as typeof fetch;
  const file = new File(['x'], 'jira export.xlsx');
  assert.deepEqual(await fetchSupportConfigs(fetcher), [{ id: 'demo', client: 'Demo', groups: ['A', 'B'] }]);
  assert.deepEqual(await fetchSupportPeriod(file, fetcher), { from: '2026-09', to: '2026-09' });
  const pdf = await fetchSupportReport(file, { config: 'demo', from: '2026-08', to: '2026-09', group: 1 }, fetcher);
  assert.equal(pdf.filename, 'Бусад 2026-09.pdf');
  assert.equal(await pdf.blob.text(), '%PDF-');
  assert.equal(calls[1].url, '/api/support-reports/period?filename=jira+export.xlsx');
  assert.equal(calls[2].url, '/api/support-reports?config=demo&from=2026-08&to=2026-09&group=1&filename=jira+export.xlsx');
  assert.equal(calls[2].init?.method, 'POST');
  assert.equal(calls[2].init?.body, file);
  assert.ok(calls.every(c => c.init?.signal instanceof AbortSignal));
});

test('support report failures carry the server reason for 4xx and hide 5xx bodies', async () => {
  const file = new File(['x'], 'a.csv');
  const bad = (async () => Response.json({ error: 'Missing required columns: System' }, { status: 400 })) as typeof fetch;
  await assert.rejects(fetchSupportPeriod(file, bad), e => e instanceof ReportRequestError && e.status === 400 && e.message === 'Missing required columns: System');
  const down = (async () => new Response('PRIVATE', { status: 500 })) as typeof fetch;
  await assert.rejects(fetchSupportReport(file, { config: 'd', from: '2026-09', to: '2026-09', group: 0 }, down), e => e instanceof ReportRequestError && e.status === 500 && !e.message.includes('PRIVATE'));
});

test('chat posts the question, locale and optional client as JSON with a timeout', async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetcher = (async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(String(url).endsWith('clients') ? ['acme'] : { answer: 'a', sources: [] }), { status: 200 });
  }) as typeof fetch;
  assert.deepEqual(await askChat('How?', 'mn', 'acme', fetcher), { answer: 'a', sources: [] });
  await askChat('How?', 'en', undefined, fetcher);
  assert.deepEqual(await fetchChatClients(fetcher), ['acme']);
  assert.equal(calls[0].url, '/api/chat');
  assert.equal(calls[0].init?.method, 'POST');
  assert.deepEqual((calls[0].init?.headers as Record<string, string>)['Content-Type'], 'application/json');
  assert.ok(calls[0].init?.signal instanceof AbortSignal);
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { question: 'How?', locale: 'mn', client: 'acme' });
  assert.deepEqual(JSON.parse(String(calls[1].init?.body)), { question: 'How?', locale: 'en' });
  assert.equal(calls[2].url, '/api/chat/clients');
});

test('chat failures reject without echoing a server error body', async () => {
  const fail = (async () => new Response('PRIVATE', { status: 500 })) as typeof fetch;
  await assert.rejects(() => askChat('q', 'en', undefined, fail), error => error instanceof ReportRequestError && error.status === 500 && !error.message.includes('PRIVATE'));
});

test('support upload errors lead with the localized text and keep the 4xx server detail', () => {
  const text = { invalid: 'INVALID:', tooLarge: 'TOO_LARGE', generic: 'GENERIC' };
  assert.equal(supportErrorText(new ReportRequestError(400, 'Missing required columns: System'), text), 'INVALID: Missing required columns: System');
  assert.equal(supportErrorText(new ReportRequestError(413), text), 'TOO_LARGE');
  assert.equal(supportErrorText(new ReportRequestError(500, 'PRIVATE'), text), 'GENERIC');
  assert.equal(supportErrorText(new ReportRequestError(404, 'Unknown config'), text), 'GENERIC');
  assert.equal(supportErrorText(new ReportRequestError(400), text), 'GENERIC');
  assert.equal(supportErrorText(new TypeError('Failed to fetch'), text), 'GENERIC');
});
