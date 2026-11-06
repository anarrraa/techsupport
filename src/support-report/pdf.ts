import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';
import { isResolved, ticketHours, type ClientConfig, type Party, type Period, type Row, type SectionKey, type SupportReport } from './support-report.ts';

// Helvetica has no Cyrillic; Noto Sans (OFL, assets/fonts/OFL.txt) is embedded instead.
const FONT = fileURLToPath(new URL('../../assets/fonts/NotoSans-Regular.ttf', import.meta.url));
const BOLD = fileURLToPath(new URL('../../assets/fonts/NotoSans-Bold.ttf', import.meta.url));
const MARGIN = 50;
const BAR = '#2563eb';
const LINE = '#9ca3af';

type Doc = PDFKit.PDFDocument;
type Column = { header: string; width: number; align?: 'left' | 'right' | 'center' };

const pad = (n: number) => String(n).padStart(2, '0');
// Dates hold wall-clock time in their UTC fields (see support-report.ts).
const when = (v: unknown) => (v instanceof Date ? `${v.getUTCFullYear()}.${pad(v.getUTCMonth() + 1)}.${pad(v.getUTCDate())} ${pad(v.getUTCHours())}:${pad(v.getUTCMinutes())}` : '');
const money = (n: number) => Math.round(n).toLocaleString('en-US');
const text = (v: unknown) => (v === null || v === undefined ? '' : String(v));

function periodRange({ from, to }: Period): string {
	const [fy, fm] = from.split('-').map(Number);
	const [ty, tm] = to.split('-').map(Number);
	const lastDay = new Date(Date.UTC(ty, tm, 0)).getUTCDate();
	return `${fy} оны ${fm} сарын 1 - ${ty} оны ${tm} сарын ${lastDay}`;
}

function lead({ from, to }: Period): string {
	const m = (p: string) => Number(p.slice(5));
	return from === to ? `${m(from)}-р сард` : `${m(from)}–${m(to)}-р саруудад`;
}

function ensureSpace(doc: Doc, height: number): void {
	if (doc.y + height > doc.page.height - MARGIN) doc.addPage();
}

function heading(doc: Doc, n: number, title: string): void {
	ensureSpace(doc, 60);
	doc.moveDown(0.8).font(BOLD).fontSize(12).fillColor('black').text(`${n}. ${title}`, MARGIN);
	doc.moveDown(0.3).font(FONT).fontSize(10);
}

function bullet(doc: Doc, line: string): void {
	doc.font(FONT).fontSize(10).fillColor('black').text(`-  ${line}`, MARGIN + 10, doc.y, { width: doc.page.width - 2 * MARGIN - 10 });
	doc.moveDown(0.3);
}

function table(doc: Doc, columns: Column[], rows: string[][], boldLast = false): void {
	const fontSize = 8;
	const rowHeight = (cells: string[], font: string) => {
		doc.font(font).fontSize(fontSize);
		return Math.max(...cells.map((c, i) => doc.heightOfString(c || ' ', { width: columns[i].width - 6 }))) + 6;
	};
	const draw = (cells: string[], font: string, fill?: string) => {
		const h = rowHeight(cells, font);
		let x = MARGIN;
		const y = doc.y;
		cells.forEach((cell, i) => {
			const w = columns[i].width;
			if (fill) doc.rect(x, y, w, h).fill(fill);
			doc.rect(x, y, w, h).lineWidth(0.5).stroke(LINE);
			doc.fillColor('black').font(font).fontSize(fontSize).text(cell, x + 3, y + 3, { width: w - 6, align: columns[i].align ?? 'left' });
			x += w;
		});
		doc.x = MARGIN;
		doc.y = y + h;
	};
	const header = columns.map((c) => c.header);
	ensureSpace(doc, rowHeight(header, BOLD) + 20);
	draw(header, BOLD, '#e5e7eb');
	rows.forEach((cells, i) => {
		const font = boldLast && i === rows.length - 1 ? BOLD : FONT;
		if (doc.y + rowHeight(cells, font) > doc.page.height - MARGIN) {
			doc.addPage();
			draw(header, BOLD, '#e5e7eb');
		}
		draw(cells, font);
	});
	doc.moveDown(0.5);
}

// ponytail: one horizontal bar style for every chart (the samples' pies read better as bars anyway).
function barChart(doc: Doc, title: string, data: Record<string, number>): void {
	const entries = Object.entries(data).sort(([, a], [, b]) => b - a);
	if (!entries.length) return;
	const labelWidth = 150;
	const maxWidth = doc.page.width - 2 * MARGIN - labelWidth - 40;
	const max = Math.max(...entries.map(([, v]) => v), 1);
	ensureSpace(doc, 24 + entries.length * 16);
	doc.font(BOLD).fontSize(9).fillColor('black').text(title, MARGIN, doc.y);
	doc.moveDown(0.3);
	for (const [label, value] of entries) {
		const y = doc.y;
		doc.font(FONT).fontSize(8).fillColor('black').text(label, MARGIN, y + 2, { width: labelWidth - 8, align: 'right', lineBreak: false, ellipsis: true });
		const w = Math.max((value / max) * maxWidth, 1);
		doc.rect(MARGIN + labelWidth, y + 1, w, 11).fill(BAR);
		doc.fillColor('black').text(String(value), MARGIN + labelWidth + w + 4, y + 2, { lineBreak: false });
		doc.x = MARGIN;
		doc.y = y + 16;
	}
	doc.moveDown(0.5);
}

function counted(data: Record<string, number>): string {
	return Object.entries(data).sort(([, a], [, b]) => b - a).map(([k, v]) => `${v} ${k}`).join(', ');
}

function signature(doc: Doc, x: number, y: number, caption: string, party: Party = {}): void {
	const width = (doc.page.width - 2 * MARGIN) / 2 - 10;
	doc.font(BOLD).fontSize(10).text(caption, x, y, { width });
	doc.font(FONT);
	for (const line of [
		`${party.organization ?? ''}-ийг төлөөлж`, `Нэр: ${party.name ?? ''}`, `Албан тушаал: ${party.title ?? ''}`,
		`Утас: ${party.phone ?? ''}`, 'Гарын үсэг:',
	]) doc.text(line, x, doc.y + 4, { width });
}

export async function renderSupportReportPdf(report: SupportReport, config: ClientConfig, period: Period, generatedAt: Date): Promise<Buffer> {
	const doc = new PDFDocument({
		size: 'A4', margin: MARGIN, bufferPages: true,
		info: { Title: `Дэмжлэг үйлчилгээний тайлан — ${report.group}`, CreationDate: generatedAt, ModDate: generatedAt },
	});
	const chunks: Buffer[] = [];
	doc.on('data', (chunk: Buffer) => chunks.push(chunk));
	const done = new Promise<Buffer>((resolve, reject) => {
		doc.on('end', () => resolve(Buffer.concat(chunks)));
		doc.on('error', reject);
	});

	const group = config.groups.find((g) => g.name === report.group);
	const priority = (p: unknown) => config.priorityLabels?.[text(p)] ?? text(p);
	const when_ = lead(period);
	const usable = doc.page.width - 2 * MARGIN;
	const ticketColumns = (extra: Column[] = []): Column[] => {
		const fixed: Column[] = [
			{ header: 'Ticket', width: 50 }, { header: 'Систем', width: 62 }, { header: 'Түвшин', width: 45 },
			{ header: 'Статус', width: 48 }, { header: 'Үүсгэсэн', width: 68 }, { header: 'Шийдвэрлэсэн', width: 68 }, ...extra,
		];
		const rest = usable - fixed.reduce((s, c) => s + c.width, 0);
		return [fixed[0], { header: 'Гарчиг', width: rest }, ...fixed.slice(1)];
	};
	const ticketCells = (r: Row, extra: string[] = []) => [
		text(r['Issue key']), text(r.Summary), text(r.System), priority(r.Priority), text(r.Status), when(r.Created), when(r['Resolved at']), ...extra,
	];

	// Title and header block
	doc.font(BOLD).fontSize(16).text('Дэмжлэг үйлчилгээний тайлан', { align: 'center' });
	doc.moveDown();
	const scope = group?.scope ?? Object.keys(report.bySystem).join(', ');
	for (const [label, value] of [
		['Тайлант хугацаа', periodRange(period)], ['Захиалагч', config.client],
		['Гүйцэтгэгч', config.contractor ?? 'Зеро Технологи ХХК'], ['Хамрах хүрээ', scope],
	]) {
		const y = doc.y;
		doc.font(BOLD).fontSize(10).text(label, MARGIN, y, { width: 150 });
		doc.font(FONT).text(value, MARGIN + 150, y, { width: usable - 150 });
		doc.moveDown(0.4);
	}

	let n = 0;
	const shown = (key: SectionKey) => report.sections[key];

	heading(doc, ++n, 'Нийт тикетийн ерөнхий мэдээлэл');
	const months = Object.entries(report.byMonth).map(([m, c]) => `${Number(m.slice(5))}-р сард ${c}`).join(', ');
	bullet(doc, report.total
		? `${when_} ${report.group} дээр нийт ${report.total} тикет бүртгэгдсэн${Object.keys(report.byMonth).length > 1 ? ` (${months})` : ''}. Төрлөөр нь ${counted(report.byType)} тикет байна.`
		: `${when_} ${report.group} дээр тикет бүртгэгдээгүй.`);
	barChart(doc, 'Төрөл', report.byType);
	barChart(doc, 'Систем', report.bySystem);
	if (report.byOrganization) barChart(doc, 'Байгууллага', report.byOrganization);

	heading(doc, ++n, 'Тикет шийдвэрлэлт');
	if (report.total) {
		const pct = ((report.resolved / report.total) * 100).toFixed(1).replace('.', ',');
		bullet(doc, `Нийт ${report.total} тикетийн ${pct}%-ийг буюу ${report.resolved} тикетийг шийдвэрлэсэн.`);
		if (report.openTickets.length) {
			const byStatus = Object.entries(report.openTickets.reduce<Record<string, number>>((acc, r) => ({ ...acc, [text(r.Status)]: (acc[text(r.Status)] ?? 0) + 1 }), {}));
			bullet(doc, `Шийдвэрлэгдээгүй ${report.openTickets.length} тикет байна (${byStatus.map(([s, c]) => `${s} ${c}`).join(', ')}).`);
			table(doc, ticketColumns(), report.openTickets.map((r) => ticketCells(r)));
		}
	} else bullet(doc, 'Тикет бүртгэгдээгүй.');

	const defects = shown('defects');
	if (defects) {
		heading(doc, ++n, 'Доголдол засварлалтын мэдээлэл');
		if (defects.tickets.length) {
			bullet(doc, `${when_} нийт ${defects.tickets.length} доголдол бүртгэгдсэнээс ${defects.resolved} доголдлыг засварласан. ${defects.open} доголдол шийдвэрлэгдээгүй байна.`);
			const fr = report.firstResponse;
			if (fr) bullet(doc, `Доголдолд анхны хариу өгөх дундаж хугацаа ${fr.averageMinutes} минут (${fr.tickets} тикет)${fr.targetMinutes === null ? '' : `, SLA ≤${fr.targetMinutes} минут — ${fr.averageMinutes <= fr.targetMinutes ? 'хангасан' : 'хангаагүй'}`}.`);
			barChart(doc, 'Доголдол — түвшин', Object.fromEntries(Object.entries(defects.byPriority).map(([p, c]) => [priority(p), c])));
			barChart(doc, 'Доголдол — систем', defects.bySystem);
		} else bullet(doc, 'Доголдол бүртгэгдээгүй.');

		heading(doc, ++n, 'Давтан гарсан доголдлын мэдээлэл');
		if (report.repeated === null) bullet(doc, 'Давтан гарсан доголдлын тэмдэглэгээ хийгдээгүй.');
		else if (!report.repeated.length) bullet(doc, 'Давтан гарсан доголдол байхгүй.');
		else {
			bullet(doc, `Ижил төрлийн алдаа давтан гарсан доголдлыг нэгтгэн үзвэл: ${report.repeated.map((g) => `«${g.label}» – ${g.tickets.length} тикет (${g.resolved} шийдвэрлэсэн)`).join('; ')}.`);
			const cols = ticketColumns();
			table(doc, [{ header: 'Давтагдсан алдаа', width: 80 }, { ...cols[0] }, { ...cols[1], width: cols[1].width - 80 }, ...cols.slice(2)],
				report.repeated.flatMap((g) => g.tickets.map((r) => [g.label, ...ticketCells(r)])));
		}
	}

	for (const [key, title, empty] of [
		['improvements', 'Сайжруулалтын мэдээлэл', 'Сайжруулалт бүртгэгдээгүй.'],
		['paid', 'Дараах төлбөрт ажлын мэдээлэл', 'Дараах төлбөрт ажил бүртгэгдээгүй.'],
	] as const) {
		const section = shown(key);
		if (!section) continue;
		heading(doc, ++n, title);
		if (!section.tickets.length) {
			bullet(doc, empty);
			continue;
		}
		bullet(doc, `${when_} нийт ${section.tickets.length} тикет бүртгэгдсэнээс ${section.resolved} нь шийдвэрлэгдсэн, ${section.open} нь нээлттэй байна.${section.hours ? ` Нийт ${section.hours} хүн цагийн ажил гүйцэтгэсэн.` : ''}`);
		if (key === 'improvements' && report.improvementQuota) {
			bullet(doc, `Гэрээний сайжруулалтын ${report.improvementQuota.limit} цагаас ${report.improvementQuota.used} цагийг ашигласан.`);
		}
		table(doc, ticketColumns([{ header: 'Хүн цаг', width: 40, align: 'right' }]),
			section.tickets.map((r) => ticketCells(r, [ticketHours(key, r) ? String(ticketHours(key, r)) : ''])));
	}

	heading(doc, ++n, 'SLA хугацаанд шийдвэрлээгүй тикетүүдийн алдангийн мэдээлэл');
	const { penalties } = report;
	if (penalties.tickets.length) {
		bullet(doc, `SLA-ийн засварлах хугацаа хэтэрсэн ${penalties.tickets.length} тикетийн алдангийн мэдээллийг доор харуулав. Нийт алданги ${money(penalties.total)}₮.`);
		const summary = Object.entries(penalties.byPriority);
		const days = summary.reduce((s, [, p]) => s + p.days, 0);
		table(doc, [
			{ header: 'Доголдлын түвшин', width: usable / 4 }, { header: 'Тикетийн тоо', width: usable / 4, align: 'right' },
			{ header: 'Хэтэрсэн хоног', width: usable / 4, align: 'right' }, { header: 'Алданги (₮)', width: usable / 4, align: 'right' },
		], [
			...summary.map(([p, s]) => [priority(p), String(s.tickets), String(s.days), money(s.amount)]),
			['НИЙТ', String(penalties.tickets.length), String(days), money(penalties.total)],
		], true);
		const fixed = 55 + 60 + 45 + 50 + 50 + 35 + 55 + 80;
		table(doc, [
			{ header: 'Ticket', width: 55 }, { header: 'Гарчиг', width: usable - fixed }, { header: 'Систем', width: 60 },
			{ header: 'Гэрээ', width: 45 }, { header: 'Түвшин', width: 50 }, { header: 'Статус', width: 50 },
			{ header: 'Хоног', width: 35, align: 'right' }, { header: 'Алданги (₮)', width: 55, align: 'right' }, { header: 'Тайлбар', width: 80 },
		], [
			...penalties.tickets.map((t) => [t.key, t.summary, t.system, t.contract, priority(t.priority), t.status, String(t.days), money(t.amount), t.note]),
			[`НИЙТ — ${penalties.tickets.length} тикет`, '', '', '', '', '', String(days), money(penalties.total), ''],
		], true);
	} else bullet(doc, 'SLA хугацаа хэтэрсэн тикет бүртгэгдээгүй.');
	if (report.carriedOver.length) {
		const open = report.carriedOver.filter((r) => !isResolved(r)).length;
		bullet(doc, `Өмнөх үеэс шилжсэн ${report.carriedOver.length} тикет (одоо нээлттэй ${open}):`);
		table(doc, ticketColumns(), report.carriedOver.map((r) => ticketCells(r)));
	} else bullet(doc, 'Өмнөх үеэс шилжсэн хаагдаагүй тикет байхгүй.');

	// Signatures
	ensureSpace(doc, 140);
	doc.moveDown(2);
	const y = doc.y;
	signature(doc, MARGIN, y, 'Хүлээлгэн өгсөн:', { organization: config.contractor ?? 'Зеро Технологи ХХК', ...config.signer });
	const left = doc.y;
	signature(doc, MARGIN + usable / 2 + 10, y, 'Хүлээн авсан:', { organization: config.client, ...config.receiver });
	doc.y = Math.max(left, doc.y) + 20;
	doc.font(FONT).fontSize(10).text(`Боловсруулсан огноо: ${generatedAt.getUTCFullYear()}/${pad(generatedAt.getUTCMonth() + 1)}/${pad(generatedAt.getUTCDate())}`, MARGIN, doc.y, { width: usable, align: 'center' });

	const { count } = doc.bufferedPageRange();
	for (let i = 0; i < count; i++) {
		doc.switchToPage(i);
		doc.page.margins.bottom = 0; // footer sits below the content area; without this pdfkit adds a page
		doc.font(FONT).fontSize(8).fillColor('black').text(String(i + 1), MARGIN, doc.page.height - MARGIN + 15, { width: usable, align: 'right', lineBreak: false });
	}
	doc.end();
	return done;
}
