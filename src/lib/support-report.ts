// Client support report: Jira export rows (schemaless, read by header name) → per-group report data.
// Overdue days, penalties overrides, hours and repeated-defect labels are human-filled columns; nothing here
// derives SLA time from timestamps (Jira owns SLA). See for-agents/prd-support-report.md.

export type Row = Record<string, unknown>;
export type Period = { from: string; to: string };
export type SectionKey = 'defects' | 'improvements' | 'paid';

export type Party = { organization?: string; name?: string; title?: string; phone?: string };

export type ClientConfig = {
	client: string;
	/** Defaults to Зеро Технологи ХХК in the PDF. */
	contractor?: string;
	/** `scope` is the "Хамрах хүрээ" text; defaults to the group's systems. */
	groups: { name: string; systems: string[] | '*rest'; scope?: string }[];
	/** Display names for Jira priorities, e.g. { Medium: 'Дунд' }. */
	priorityLabels?: Record<string, string>;
	signer?: Party;
	receiver?: Party;
	sections: Record<string, SectionKey>;
	hide?: SectionKey[];
	penaltyRates?: Record<string, { daily: number; contract?: string }>;
	improvementHoursPerMonth?: number;
	firstResponseTargetMinutes?: number;
};

export type Section = { tickets: Row[]; resolved: number; open: number; hours: number; byPriority: Record<string, number>; bySystem: Record<string, number> };

export type PenaltyTicket = { key: string; summary: string; system: string; contract: string; priority: string; status: string; days: number; amount: number; note: string };
export type Penalties = {
	tickets: PenaltyTicket[];
	byPriority: Record<string, { tickets: number; days: number; amount: number }>;
	total: number;
};

export type SupportReport = {
	group: string;
	total: number;
	resolved: number;
	openTickets: Row[];
	byMonth: Record<string, number>;
	bySystem: Record<string, number>;
	byType: Record<string, number>;
	byOrganization: Record<string, number> | null;
	sections: Partial<Record<SectionKey, Section>>;
	carriedOver: Row[];
	penalties: Penalties;
	/** null = the file has no `Давтан` column, so nobody marked repeats; [] = marked, none found. */
	repeated: { label: string; tickets: Row[]; resolved: number }[] | null;
	improvementQuota: { used: number; limit: number } | null;
	firstResponse: { averageMinutes: number; tickets: number; targetMinutes: number | null } | null;
};

const REQUIRED = ['Issue key', 'Summary', 'System', 'Priority', 'Request Type', 'Status', 'Created', 'Resolved at'];

function countBy(rows: Row[], key: string | ((r: Row) => string)): Record<string, number> {
	const counts: Record<string, number> = {};
	for (const r of rows) {
		const k = typeof key === 'string' ? String(r[key]) : key(r);
		counts[k] = (counts[k] ?? 0) + 1;
	}
	return counts;
}

// Dates follow the exceljs convention: UTC fields hold the wall-clock time written in the sheet.
function month(value: unknown): string {
	return value instanceof Date ? value.toISOString().slice(0, 7) : '';
}

const SECTION_KEYS: SectionKey[] = ['defects', 'improvements', 'paid'];

function sections(rows: Row[], config: ClientConfig): Partial<Record<SectionKey, Section>> {
	const result: Partial<Record<SectionKey, Section>> = {};
	for (const key of SECTION_KEYS) {
		const tickets = rows.filter((r) => config.sections[String(r['Request Type'])] === key || (key === 'paid' && num(r['Дараах төлбөрт цаг']) > 0));
		const resolved = tickets.filter(isResolved).length;
		const hours = tickets.reduce((sum, r) => sum + ticketHours(key, r), 0);
		result[key] = { tickets, resolved, open: tickets.length - resolved, hours, byPriority: countBy(tickets, 'Priority'), bySystem: countBy(tickets, 'System') };
	}
	return result;
}

/** Hours a ticket contributes to a section: paid work takes `Дараах төлбөрт цаг` (else all hours), others the remainder. */
export function ticketHours(key: SectionKey, r: Row): number {
	return key === 'paid' ? num(r['Дараах төлбөрт цаг']) || num(r['Хүн цаг']) : num(r['Хүн цаг']) - num(r['Дараах төлбөрт цаг']);
}

export function isResolved(r: Row): boolean {
	return r['Resolved at'] instanceof Date;
}

function repeated(rows: Row[]): NonNullable<SupportReport['repeated']> {
	const groups = new Map<string, Row[]>();
	for (const r of rows) {
		const label = String(r['Давтан'] ?? '').trim();
		if (label) groups.set(label, [...(groups.get(label) ?? []), r]);
	}
	return [...groups].map(([label, tickets]) => ({ label, tickets, resolved: tickets.filter(isResolved).length }));
}

const FIRST_RESPONSE = 'Time to first response';

// Jira-computed elapsed time: plain minutes or "1h 5m". ponytail: format unconfirmed against a real export (roadmap TODO).
function minutes(value: unknown): number | null {
	if (value === null || value === undefined || value === '') return null;
	if (typeof value === 'number') return value;
	const match = /^\s*(?:(\d+)h)?\s*(?:(\d+)m)?\s*$/.exec(String(value));
	if (!match || (!match[1] && !match[2])) throw new Error(`Unreadable first response time "${String(value)}"`);
	return Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0);
}

function firstResponse(defects: Row[], targetMinutes = null as number | null): SupportReport['firstResponse'] {
	const values = defects.map((r) => minutes(r[FIRST_RESPONSE])).filter((m): m is number => m !== null);
	if (!values.length) return null;
	return { averageMinutes: Math.round(values.reduce((a, b) => a + b, 0) / values.length), tickets: values.length, targetMinutes };
}

function monthsIn({ from, to }: Period): number {
	const [fy, fm] = from.split('-').map(Number);
	const [ty, tm] = to.split('-').map(Number);
	return (ty - fy) * 12 + tm - fm + 1;
}

// Blank or non-numeric cells (the sheets use "ok" for "not overdue") count as nothing.
function num(value: unknown): number {
	const n = Number(value);
	return value === null || value === '' || !Number.isFinite(n) ? 0 : n;
}

function penalties(rows: Row[], rates: ClientConfig['penaltyRates'] = {}): Penalties {
	const tickets = rows.filter((r) => num(r['Хэтэрсэн хоног']) > 0).map((r): PenaltyTicket => {
		const system = String(r.System);
		const rate = rates[system];
		if (!rate) throw new Error(`No daily rate configured for system "${system}" (overdue ticket ${String(r['Issue key'])})`);
		const days = num(r['Хэтэрсэн хоног']);
		return {
			key: String(r['Issue key']), summary: String(r.Summary), system, contract: rate.contract ?? '',
			priority: String(r.Priority), status: String(r.Status), days,
			amount: num(r['Нийт']) || days * rate.daily, note: String(r['Тайлбар'] ?? ''),
		};
	});
	const byPriority: Penalties['byPriority'] = {};
	for (const t of tickets) {
		const p = (byPriority[t.priority] ??= { tickets: 0, days: 0, amount: 0 });
		p.tickets += 1;
		p.days += t.days;
		p.amount += t.amount;
	}
	return { tickets, byPriority, total: tickets.reduce((sum, t) => sum + t.amount, 0) };
}

/** A problem in the uploaded file itself, safe to show to the uploader. */
export class SupportInputError extends Error {}

export function assertSupportRows(rows: Row[]): void {
	const missing = REQUIRED.filter((column) => !rows.some((r) => column in r));
	if (missing.length) throw new SupportInputError(`Missing required columns: ${missing.join(', ')}`);
	const undated = rows.find((r) => !(r.Created instanceof Date));
	if (undated) throw new SupportInputError(`Created is not a date for ticket ${String(undated['Issue key'])}`);
	const badResolved = rows.find((r) => r['Resolved at'] != null && r['Resolved at'] !== '' && !isResolved(r));
	if (badResolved) throw new SupportInputError(`Resolved at is not a date for ticket ${String(badResolved['Issue key'])}: "${String(badResolved['Resolved at'])}"`);
}

export function buildSupportReport(rows: Row[], config: ClientConfig, period: Period): SupportReport[] {
	assertSupportRows(rows);
	const named = new Set(config.groups.flatMap((g) => (g.systems === '*rest' ? [] : g.systems)));
	return config.groups.map((g) => {
		const own = rows
			.filter((r) => String(r['Хасах'] ?? '').trim() === '') // staff-excluded rows
			.filter((r) => (g.systems === '*rest' ? !named.has(String(r.System)) : g.systems.includes(String(r.System))));
		const inPeriod = own.filter((r) => month(r.Created) >= period.from && month(r.Created) <= period.to);
		const carriedOver = own
			.filter((r) => month(r.Created) < period.from && (!isResolved(r) || month(r['Resolved at']) >= period.from))
			.sort((a, b) => (a.Created as Date).getTime() - (b.Created as Date).getTime());
		const all = sections(inPeriod, config);
		return {
			group: g.name,
			total: inPeriod.length,
			resolved: inPeriod.filter(isResolved).length,
			openTickets: inPeriod.filter((r) => !isResolved(r)),
			byMonth: Object.fromEntries(Object.entries(countBy(inPeriod, (r) => month(r.Created))).sort()),
			bySystem: countBy(inPeriod, 'System'),
			byType: countBy(inPeriod, 'Request Type'),
			byOrganization: rows.some((r) => 'Organizations' in r) ? countBy(inPeriod, 'Organizations') : null,
			sections: Object.fromEntries(Object.entries(all).filter(([k]) => !config.hide?.includes(k as SectionKey))),
			improvementQuota: config.improvementHoursPerMonth === undefined ? null : {
				used: all.improvements?.hours ?? 0,
				limit: config.improvementHoursPerMonth * monthsIn(period),
			},
			carriedOver,
			penalties: penalties([...carriedOver, ...inPeriod], config.penaltyRates),
			firstResponse: rows.some((r) => FIRST_RESPONSE in r)
				? firstResponse(all.defects?.tickets ?? [], config.firstResponseTargetMinutes)
				: null,
			repeated: rows.some((r) => 'Давтан' in r) ? repeated(inPeriod) : null,
		};
	});
}

export function suggestPeriod(rows: Row[]): Period {
	const latest = rows.map((r) => month(r.Created)).sort().at(-1) ?? '';
	return { from: latest, to: latest };
}
