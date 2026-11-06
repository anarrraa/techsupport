import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import test from 'node:test';
import { buildSupportReport, type ClientConfig, type Row } from '../../src/support-report/support-report.ts';
import { renderSupportReportPdf } from '../../src/support-report/pdf.ts';

const CONFIG: ClientConfig = {
	client: 'Жишээ ХХК',
	groups: [{ name: 'Бусад систем', systems: '*rest' }],
	sections: { 'Доголдол': 'defects', 'Сайжруулалт': 'improvements' },
	penaltyRates: { App: { daily: 1000, contract: '№1' } },
	signer: { organization: 'Гүйцэтгэгч ХХК', name: 'А. Бат', title: 'Мэргэжилтэн' },
};

const rows: Row[] = Array.from({ length: 40 }, (_, i) => ({
	'Issue key': `X-${i}`, Summary: 'Урт гарчиг '.repeat(i % 5 + 1), System: i % 3 ? 'App' : 'Web', Priority: 'Medium',
	'Request Type': i % 2 ? 'Доголдол' : 'Сайжруулалт', Status: i % 4 ? 'Resolved' : 'Open',
	Created: new Date(Date.UTC(2026, 8, 1 + (i % 28), 9)), 'Resolved at': i % 4 ? new Date(Date.UTC(2026, 8, 29, 9)) : null,
	'Хэтэрсэн хоног': i % 3 && i % 2 ? 1 : null, 'Хүн цаг': i % 2 ? null : 1,
}));

function pageStreams(pdf: Buffer): string[] {
	const raw = pdf.toString('latin1');
	const streams = [...raw.matchAll(/stream\n([\s\S]*?)\nendstream/g)].map((m) => {
		try { return inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1'); } catch { return ''; }
	});
	return streams.filter((content) => /\bBT\b/.test(content));
}

test('the support report renders as a multi-page PDF with the embedded Cyrillic font, byte-identical for the same input', async () => {
	const [report] = buildSupportReport(rows, CONFIG, { from: '2026-09', to: '2026-09' });
	const at = new Date('2026-10-04T00:00:00Z');
	const pdf = await renderSupportReportPdf(report, CONFIG, { from: '2026-09', to: '2026-09' }, at);
	assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
	assert.match(pdf.toString('latin1'), /NotoSans/);
	const pages = (pdf.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length;
	assert.ok(pages >= 2, `expected several pages, got ${pages}`);
	// A footer drawn below the margin used to spawn pages holding nothing but their number.
	const textBlocksPerPage = pageStreams(pdf).map((content) => content.split('BT').length - 1);
	assert.equal(textBlocksPerPage.length, pages);
	assert.ok(textBlocksPerPage.every((blocks) => blocks > 1), `pages with only a page number: ${textBlocksPerPage}`);
	assert.deepEqual(await renderSupportReportPdf(report, CONFIG, { from: '2026-09', to: '2026-09' }, at), pdf);
});
