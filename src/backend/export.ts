import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import type { MonthlyMetrics } from '../lib/queries/monthly-report.ts';

export const SAMPLE_NOTE = 'Sampled Jira observations, latest snapshot per observed ticket. Resolved tickets outside the scan may be absent. Not complete contractual monthly compliance.';

function summaryRows(report: MonthlyMetrics): [string, string | number][] {
	return [
		['Month (UTC)', report.month], ['Observed tickets', report.tickets], ['Snapshots', report.snapshots],
		['First response breached', report.firstResponseBreached], ['Resolution breached', report.resolutionBreached],
		['First response known / missing', `${report.firstResponseKnown} / ${report.firstResponseMissing}`],
		['Resolution known / missing', `${report.resolutionKnown} / ${report.resolutionMissing}`],
		['First response breached / all observed tickets', report.firstResponseBreachRate === null ? 'N/A' : `${(report.firstResponseBreachRate * 100).toFixed(1)}%`],
		['Resolution breached / all observed tickets', report.resolutionBreachRate === null ? 'N/A' : `${(report.resolutionBreachRate * 100).toFixed(1)}%`],
		['First capture (UTC)', report.coverage.firstCapturedAt ?? 'N/A'],
		['Last capture (UTC)', report.coverage.lastCapturedAt ?? 'N/A'],
		['Captured UTC days', report.coverage.capturedDays],
	];
}

export async function generatePDF(report: MonthlyMetrics): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const doc = new PDFDocument({ compress: false, info: { Title: `SLA observations ${report.month}`, CreationDate: new Date(report.coverage.lastCapturedAt ?? 0), ModDate: new Date(report.coverage.lastCapturedAt ?? 0) } });
		const chunks: Buffer[] = [];
		doc.on('data', (chunk: Buffer) => chunks.push(chunk));
		doc.on('end', () => resolve(Buffer.concat(chunks)));
		doc.on('error', reject);
		doc.fontSize(20).font('Helvetica-Bold').text(`SLA observations: ${report.month}`);
		doc.moveDown().fontSize(10).font('Helvetica').text(SAMPLE_NOTE);
		doc.moveDown();
		for (const [label, value] of summaryRows(report)) doc.fontSize(10).text(`${label}: ${value}`, { paragraphGap: 5 });
		doc.moveDown().font('Helvetica-Bold').text('Priority: observed tickets / first response breached / resolution breached');
		doc.font('Helvetica');
		for (const [priority, counts] of Object.entries(report.byPriority).sort(([a], [b]) => a.localeCompare(b))) {
			doc.text(`${priority}: ${counts.tickets} / ${counts.firstResponseBreached} / ${counts.resolutionBreached}`, { paragraphGap: 5 });
		}
		doc.end();
	});
}

export async function generateExcel(report: MonthlyMetrics): Promise<Buffer> {
	const workbook = new ExcelJS.Workbook();
	workbook.created = new Date(report.coverage.lastCapturedAt ?? 0);
	workbook.modified = new Date(report.coverage.lastCapturedAt ?? 0);
	const summary = workbook.addWorksheet('Summary');
	summary.columns = [{ header: 'Metric', key: 'metric', width: 55 }, { header: 'Value', key: 'value', width: 34 }];
	summary.addRows(summaryRows(report).map(([metric, value]) => ({ metric, value })));
	summary.addRow({ metric: 'Coverage limitation', value: SAMPLE_NOTE });
	summary.getRow(summary.rowCount).height = 90;
	summary.getRow(summary.rowCount).getCell(2).alignment = { wrapText: true, vertical: 'top' };
	const priority = workbook.addWorksheet('Priority Breakdown');
	priority.columns = [
		{ header: 'Priority', key: 'priority', width: 20 }, { header: 'Observed tickets', key: 'tickets', width: 20 },
		{ header: 'First response breached', key: 'firstResponseBreached', width: 26 },
		{ header: 'Resolution breached', key: 'resolutionBreached', width: 24 },
	];
	priority.addRows(Object.entries(report.byPriority).sort(([a], [b]) => a.localeCompare(b)).map(([name, counts]) => ({ priority: name, ...counts })));
	for (const sheet of [summary, priority]) {
		sheet.getRow(1).font = { bold: true };
		sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };
		sheet.views = [{ state: 'frozen', ySplit: 1 }];
	}
	return Buffer.from(await workbook.xlsx.writeBuffer());
}
