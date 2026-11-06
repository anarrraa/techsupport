import assert from 'node:assert/strict';
import test from 'node:test';
import { archiveMonths, fetchReport, fetchExport, fetchSupportConfigs, fetchSupportPeriod, fetchSupportReport, loadArchive, ReportRequestError } from '../../../src/shared/utils/report-requests.ts';
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
