import { Readable } from 'node:stream';
import ExcelJS from 'exceljs';
import type { Row } from './support-report.ts';

// Rich text, hyperlink and formula cells collapse to their visible value.
function plain(value: ExcelJS.CellValue): unknown {
	if (value === null || value === undefined) return null;
	if (typeof value !== 'object' || value instanceof Date) return value;
	if ('richText' in value) return value.richText.map((part) => part.text).join('');
	if ('result' in value) return plain(value.result as ExcelJS.CellValue);
	if ('text' in value) return value.text;
	return String(value);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Text dates become wall-clock-in-UTC Dates (the exceljs convention): ISO "2026-09-02 16:14",
// Excel "9/30/2026 14:00", Jira "01/Sep/26 11:48 AM". Anything else stays text and fails later, naming the ticket.
function date(value: unknown): unknown {
	if (typeof value !== 'string') return value;
	let m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})/.exec(value);
	if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
	m = /^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2})$/.exec(value);
	if (m) return new Date(Date.UTC(+m[3], +m[1] - 1, +m[2], +m[4], +m[5]));
	m = /^(\d{1,2})\/([A-Za-z]{3})\/(\d{2}) (\d{1,2}):(\d{2}) ?(AM|PM)$/i.exec(value);
	const month = m ? MONTHS.indexOf(m[2][0].toUpperCase() + m[2].slice(1).toLowerCase()) : -1;
	if (m && month >= 0) return new Date(Date.UTC(2000 + +m[3], month, +m[1], (+m[4] % 12) + (m[6].toUpperCase() === 'PM' ? 12 : 0), +m[5]));
	return value;
}

/** Header row → keys; every header is present on every row (null when blank) so column presence is detectable. */
export async function readRows(file: Buffer, filename: string): Promise<Row[]> {
	const workbook = new ExcelJS.Workbook();
	const sheet = filename.toLowerCase().endsWith('.csv')
		// map keeps cells as text (no exceljs number/date guessing); blank → null.
		? await workbook.csv.read(Readable.from([file.toString('utf8').replace(/^\uFEFF/, '')]), { map: (v: string) => (v === '' ? null : v) } as never)
		: (await workbook.xlsx.load(file as unknown as ArrayBuffer), workbook.worksheets[0]);
	if (!sheet) throw new Error('The workbook has no sheets');
	const headers = (sheet.getRow(1).values as ExcelJS.CellValue[]).map((v) => String(plain(v) ?? '').trim());
	const rows: Row[] = [];
	sheet.eachRow((r, n) => {
		if (n === 1) return;
		const row: Row = {};
		headers.forEach((h, i) => { if (h) row[h] = plain(r.getCell(i).value); });
		for (const column of ['Created', 'Resolved at']) if (column in row) row[column] = date(row[column]);
		rows.push(row);
	});
	return rows;
}
