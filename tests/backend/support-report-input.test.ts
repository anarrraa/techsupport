import assert from 'node:assert/strict';
import test from 'node:test';
import ExcelJS from 'exceljs';
import { readRows } from '../../src/backend/support-report-input.ts';

async function xlsx(sheets: Record<string, unknown[][]>): Promise<Buffer> {
	const workbook = new ExcelJS.Workbook();
	for (const [name, rows] of Object.entries(sheets)) workbook.addWorksheet(name).addRows(rows);
	return Buffer.from(await workbook.xlsx.writeBuffer());
}

test('xlsx rows come from the first sheet keyed by header, with every header present on every row', async () => {
	const file = await xlsx({
		ALL: [
			['Issue key', 'Created', 'Хүн цаг', 'Давтан'],
			['X-1', new Date('2026-09-01T11:48:00Z'), 3, null],
			['X-2', new Date('2026-09-02T09:00:00Z'), null, 'Карт'],
		],
		Other: [['Issue key'], ['IGNORED']],
	});
	assert.deepEqual(await readRows(file, 'report.xlsx'), [
		{ 'Issue key': 'X-1', Created: new Date('2026-09-01T11:48:00Z'), 'Хүн цаг': 3, Давтан: null },
		{ 'Issue key': 'X-2', Created: new Date('2026-09-02T09:00:00Z'), 'Хүн цаг': null, Давтан: 'Карт' },
	]);
});

test('csv rows keep cells as text, keep multi-line quoted cells, and read Created / Resolved at in Jira and Excel formats', async () => {
	const csv = '﻿Issue key,Description,Хүн цаг,Created,Resolved at\n'
		+ 'X-1,"мөр 1\nмөр 2, таслалтай",3,01/Sep/26 11:48 AM,2026-09-02 16:14\n'
		+ 'X-2,,,9/30/2026 14:00,\n'
		+ 'X-3,,,01/Sep/26 12:05 PM,03/Sep/26 12:30 AM\n';
	assert.deepEqual(await readRows(Buffer.from(csv), 'export.CSV'), [
		{ 'Issue key': 'X-1', Description: 'мөр 1\nмөр 2, таслалтай', 'Хүн цаг': '3', Created: new Date('2026-09-01T11:48:00Z'), 'Resolved at': new Date('2026-09-02T16:14:00Z') },
		{ 'Issue key': 'X-2', Description: null, 'Хүн цаг': null, Created: new Date('2026-09-30T14:00:00Z'), 'Resolved at': null },
		{ 'Issue key': 'X-3', Description: null, 'Хүн цаг': null, Created: new Date('2026-09-01T12:05:00Z'), 'Resolved at': new Date('2026-09-03T00:30:00Z') },
	]);
});

test('an unreadable date stays as text so the report can name the ticket', async () => {
	const [row] = await readRows(Buffer.from('Issue key,Created\nX-1,31.09.2026\n'), 'a.csv');
	assert.equal(row.Created, '31.09.2026');
});
