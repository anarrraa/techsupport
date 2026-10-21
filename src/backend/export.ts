import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';

interface Report {
	month: string;
	snapshots: number;
	tickets: number;
	firstResponseBreached: number;
	resolutionBreached: number;
	firstResponseBreachRate: number | null;
	resolutionBreachRate: number | null;
	byPriority: Record<string, { tickets: number; firstResponseBreached: number; resolutionBreached: number }>;
}

export async function generatePDF(report: Report): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const doc = new PDFDocument();
		const chunks: Buffer[] = [];

		doc.on('data', (chunk: Buffer) => chunks.push(chunk));
		doc.on('end', () => resolve(Buffer.concat(chunks)));
		doc.on('error', reject);

		// Title
		doc.fontSize(20).font('Helvetica-Bold').text(`SLA Report: ${report.month}`);
		doc.moveDown();

		// Summary table
		doc.fontSize(12).font('Helvetica-Bold').text('Summary Metrics', { underline: true });
		doc.moveDown(0.5);

		const y = doc.y;
		doc.fontSize(10).font('Helvetica');
		const colWidth = 150;
		const cols = ['Metric', 'Value'];

		// Headers
		cols.forEach((col, i) => {
			doc.text(col, 50 + i * colWidth, y, { width: colWidth });
		});

		// Data rows
		let rowY = y + 20;
		const metrics = [
			['Tickets Handled', report.tickets.toString()],
			['First Response Breached', report.firstResponseBreached.toString()],
			['Resolution Breached', report.resolutionBreached.toString()],
			['Compliance %', report.firstResponseBreachRate !== null ? ((1 - report.firstResponseBreachRate) * 100).toFixed(1) : 'N/A'],
		];

		metrics.forEach(row => {
			row.forEach((cell, i) => {
				doc.text(cell, 50 + i * colWidth, rowY, { width: colWidth });
			});
			rowY += 15;
		});

		doc.moveDown(2);

		// Priority breakdown
		doc.fontSize(12).font('Helvetica-Bold').text('By Priority', { underline: true });
		doc.moveDown(0.5);

		const priorityY = doc.y;
		doc.fontSize(10).font('Helvetica');
		const priorityCols = ['Priority', 'Tickets', 'Breached'];

		priorityCols.forEach((col, i) => {
			doc.text(col, 50 + i * colWidth, priorityY, { width: colWidth });
		});

		let priorityRowY = priorityY + 20;
		Object.entries(report.byPriority).forEach(([priority, data]) => {
			const row = [priority, data.tickets.toString(), data.firstResponseBreached.toString()];
			row.forEach((cell, i) => {
				doc.text(cell, 50 + i * colWidth, priorityRowY, { width: colWidth });
			});
			priorityRowY += 15;
		});

		// Footer
		doc.moveDown(2);
		doc.fontSize(9).font('Helvetica').text(`Generated: ${new Date().toISOString()}`);

		doc.end();
	});
}

export async function generateExcel(report: Report): Promise<Buffer> {
	const workbook = new ExcelJS.Workbook();

	// Sheet 1: Summary
	const summarySheet = workbook.addWorksheet('Summary');
	summarySheet.columns = [
		{ header: 'Metric', key: 'metric', width: 25 },
		{ header: 'Value', key: 'value', width: 20 },
	];

	const compliance = report.firstResponseBreachRate !== null ? ((1 - report.firstResponseBreachRate) * 100).toFixed(1) : 'N/A';
	summarySheet.addRows([
		{ metric: 'Tickets Handled', value: report.tickets },
		{ metric: 'First Response Breached', value: report.firstResponseBreached },
		{ metric: 'Resolution Breached', value: report.resolutionBreached },
		{ metric: 'Compliance %', value: compliance },
	]);

	// Style headers
	summarySheet.getRow(1).font = { bold: true };
	summarySheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD3D3D3' } };

	// Sheet 2: Priority Breakdown
	const prioritySheet = workbook.addWorksheet('Priority Breakdown');
	prioritySheet.columns = [
		{ header: 'Priority', key: 'priority', width: 20 },
		{ header: 'Tickets', key: 'tickets', width: 15 },
		{ header: 'Breached', key: 'breached', width: 15 },
	];

	const priorityRows = Object.entries(report.byPriority).map(([priority, data]) => ({
		priority,
		tickets: data.tickets,
		breached: data.firstResponseBreached,
	}));

	prioritySheet.addRows(priorityRows);

	// Style headers
	prioritySheet.getRow(1).font = { bold: true };
	prioritySheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD3D3D3' } };

	// Add borders to all cells
	prioritySheet.eachRow({ includeEmpty: false }, row => {
		row.eachCell({ includeEmpty: true }, cell => {
			cell.border = {
				top: { style: 'thin' },
				left: { style: 'thin' },
				bottom: { style: 'thin' },
				right: { style: 'thin' },
			};
		});
	});

	return (workbook.xlsx.writeBuffer() as unknown) as Promise<Buffer>;
}
