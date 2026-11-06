import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSupportReport, suggestPeriod, type ClientConfig, type Row } from '../../src/lib/support-report.ts';

const SEPT = { from: '2026-09', to: '2026-09' };

const CONFIG: ClientConfig = {
	client: 'Жишээ ХХК',
	groups: [{ name: 'Бүгд', systems: '*rest' }],
	sections: { 'Доголдол': 'defects', 'Сайжруулалт': 'improvements', 'Дараах төлбөрт': 'paid' },
};

function row(fields: Partial<Row> = {}): Row {
	return {
		'Issue key': 'X-1', Summary: 'Гарчиг', System: 'App', Priority: 'Medium', 'Request Type': 'Доголдол',
		Status: 'Resolved', Created: new Date('2026-09-02T10:00:00Z'), 'Resolved at': new Date('2026-09-03T10:00:00Z'),
		...fields,
	};
}

test('a file missing required columns fails and names every missing column', () => {
	const { System: _s, Created: _c, ...partial } = row();
	assert.throws(() => buildSupportReport([partial], CONFIG, SEPT), /System.*Created/);
});

test('systems split into report groups and *rest takes every system not named elsewhere', () => {
	const config: ClientConfig = { ...CONFIG, groups: [{ name: 'GP', systems: ['GP-POS', 'GP-HQ'] }, { name: 'Бусад', systems: '*rest' }] };
	const rows = [row({ System: 'GP-POS' }), row({ System: 'GP-HQ' }), row({ System: 'LMS' }), row({ System: 'LMS' }), row({ System: 'EZ Store' })];
	const [gp, other] = buildSupportReport(rows, config, SEPT);
	assert.deepEqual([gp.group, gp.total, gp.bySystem], ['GP', 2, { 'GP-POS': 1, 'GP-HQ': 1 }]);
	assert.deepEqual([other.group, other.total, other.bySystem], ['Бусад', 3, { LMS: 2, 'EZ Store': 1 }]);
});

test('rows are split by created month; earlier rows still open at period start carry over; later rows are skipped', () => {
	const rows = [
		row({ 'Issue key': 'JUL', Created: new Date('2026-07-31T23:30:00Z') }),
		row({ 'Issue key': 'AUG', Created: new Date('2026-08-01T00:10:00Z') }),
		row({ 'Issue key': 'SEP', Created: new Date('2026-09-30T23:50:00Z') }),
		row({ 'Issue key': 'OCT', Created: new Date('2026-10-01T00:00:00Z') }),
		row({ 'Issue key': 'OPEN-JUN', Created: new Date('2026-06-20T10:00:00Z'), Status: 'Open', 'Resolved at': null }),
		row({ 'Issue key': 'LATE-JUN', Created: new Date('2026-06-21T10:00:00Z'), 'Resolved at': new Date('2026-08-02T10:00:00Z') }),
		row({ 'Issue key': 'DONE-JUN', Created: new Date('2026-06-22T10:00:00Z'), 'Resolved at': new Date('2026-06-30T10:00:00Z') }),
	];
	const [report] = buildSupportReport(rows, CONFIG, { from: '2026-08', to: '2026-09' });
	assert.equal(report.total, 2);
	assert.deepEqual(report.byMonth, { '2026-08': 1, '2026-09': 1 });
	assert.deepEqual(report.carriedOver.map((r) => r['Issue key']), ['OPEN-JUN', 'LATE-JUN', 'JUL']);
});

test('penalty is overdue days times the system daily rate, a filled total overrides it, and totals roll up by priority', () => {
	const config: ClientConfig = { ...CONFIG, penaltyRates: { App: { daily: 8243, contract: '№Б/251' } } };
	const rows = [
		row({ 'Issue key': 'A', 'Хэтэрсэн хоног': 2 }),
		row({ 'Issue key': 'B', 'Хэтэрсэн хоног': '3', Нийт: 29015, Priority: 'High', Тайлбар: 'тохиролцсон' }),
		row({ 'Issue key': 'C', 'Хэтэрсэн хоног': 'ok' }),
		row({ 'Issue key': 'D' }),
		row({ 'Issue key': 'PREV', Created: new Date('2026-08-20T10:00:00Z'), 'Resolved at': null, 'Хэтэрсэн хоног': 1 }),
	];
	const [{ penalties }] = buildSupportReport(rows, config, SEPT);
	assert.deepEqual(penalties.tickets.map((t) => [t.key, t.contract, t.days, t.amount, t.note]), [
		['PREV', '№Б/251', 1, 8243, ''],
		['A', '№Б/251', 2, 16486, ''],
		['B', '№Б/251', 3, 29015, 'тохиролцсон'],
	]);
	assert.deepEqual(penalties.byPriority, { Medium: { tickets: 2, days: 3, amount: 24729 }, High: { tickets: 1, days: 3, amount: 29015 } });
	assert.equal(penalties.total, 53744);
});

test('an overdue ticket on a system with no configured daily rate fails visibly', () => {
	assert.throws(() => buildSupportReport([row({ 'Хэтэрсэн хоног': 1 })], CONFIG, SEPT), /daily rate.*App/);
});

test('request types map to sections through the client config; hidden sections disappear and empty ones stay with zero tickets', () => {
	const config: ClientConfig = { ...CONFIG, hide: ['paid'] };
	const rows = [
		row({ 'Issue key': 'D1', Priority: 'High' }),
		row({ 'Issue key': 'D2', Status: 'Open', 'Resolved at': null }),
		row({ 'Issue key': 'I1', 'Request Type': 'Мэдээлэл өгсөн' }),
		row({ 'Issue key': 'P1', 'Request Type': 'Дараах төлбөрт' }),
	];
	const [report] = buildSupportReport(rows, config, SEPT);
	assert.deepEqual(report.byType, { 'Доголдол': 2, 'Мэдээлэл өгсөн': 1, 'Дараах төлбөрт': 1 });
	assert.deepEqual(Object.keys(report.sections).sort(), ['defects', 'improvements']);
	const { defects, improvements } = report.sections;
	assert.deepEqual([defects?.tickets.map((t) => t['Issue key']), defects?.resolved, defects?.open], [['D1', 'D2'], 1, 1]);
	assert.deepEqual(defects?.byPriority, { High: 1, Medium: 1 });
	assert.equal(improvements?.tickets.length, 0);
});

test('repeated defects group by the human label; an empty column means none, an absent column means not marked', () => {
	const marked = buildSupportReport([
		row({ 'Issue key': 'R1', Давтан: 'Карт уншуулах' }),
		row({ 'Issue key': 'R2', Давтан: '' }),
		row({ 'Issue key': 'R3', Давтан: 'Карт уншуулах', Status: 'Open', 'Resolved at': null }),
		row({ 'Issue key': 'R4', Давтан: 'Тайлан татах' }),
	], CONFIG, SEPT)[0].repeated;
	assert.deepEqual(marked?.map((g) => [g.label, g.tickets.map((t) => t['Issue key']), g.resolved]), [
		['Карт уншуулах', ['R1', 'R3'], 1],
		['Тайлан татах', ['R4'], 1],
	]);
	assert.deepEqual(buildSupportReport([row({ Давтан: null })], CONFIG, SEPT)[0].repeated, []);
	assert.equal(buildSupportReport([row()], CONFIG, SEPT)[0].repeated, null);
});

test('paid hours move out of improvements into the paid-work section, and the optional quota reports hours used', () => {
	const config: ClientConfig = { ...CONFIG, improvementHoursPerMonth: 8 };
	const rows = [
		row({ 'Issue key': 'I1', 'Request Type': 'Сайжруулалт', 'Хүн цаг': 6 }),
		row({ 'Issue key': 'I2', 'Request Type': 'Сайжруулалт', 'Хүн цаг': 12, 'Дараах төлбөрт цаг': 9 }),
		row({ 'Issue key': 'P1', 'Request Type': 'Дараах төлбөрт', 'Хүн цаг': '4' }),
	];
	const [{ sections, improvementQuota }] = buildSupportReport(rows, config, SEPT);
	assert.equal(sections.improvements?.hours, 9);
	assert.deepEqual([sections.paid?.tickets.map((t) => t['Issue key']), sections.paid?.hours], [['I2', 'P1'], 13]);
	assert.deepEqual(improvementQuota, { used: 9, limit: 8 });
});

test('resolution counts resolved tickets in the period and lists the open ones', () => {
	const [report] = buildSupportReport([
		row({ 'Issue key': 'R1' }),
		row({ 'Issue key': 'O1', Status: 'Open', 'Resolved at': null }),
		row({ 'Issue key': 'O2', Status: 'In Progress', 'Resolved at': '' }),
		row({ 'Issue key': 'R2' }),
	], CONFIG, SEPT);
	assert.equal(report.resolved, 2);
	assert.deepEqual(report.openTickets.map((t) => t['Issue key']), ['O1', 'O2']);
});

test('first response average comes only from the Jira SLA column, over defects, and is omitted when the column is absent', () => {
	const config: ClientConfig = { ...CONFIG, firstResponseTargetMinutes: 30 };
	const [report] = buildSupportReport([
		row({ 'Time to first response': '10m' }),
		row({ 'Time to first response': '1h 5m' }),
		row({ 'Time to first response': 15 }),
		row({ 'Time to first response': '' }),
		row({ 'Request Type': 'Сайжруулалт', 'Time to first response': '9h' }),
	], config, SEPT);
	assert.deepEqual(report.firstResponse, { averageMinutes: 30, tickets: 3, targetMinutes: 30 });
	assert.equal(buildSupportReport([row()], config, SEPT)[0].firstResponse, null);
	assert.throws(() => buildSupportReport([row({ 'Time to first response': 'soon' })], config, SEPT), /first response.*soon/);
});

test('a row whose Created cell is not a date fails and names the ticket', () => {
	assert.throws(() => buildSupportReport([row({ 'Issue key': 'BAD-1', Created: '31/09/2026' })], CONFIG, SEPT), /BAD-1/);
});

test('the suggested period is the latest created month in the file', () => {
	const rows = [row({ Created: new Date('2026-08-31T15:20:00Z') }), row({ Created: new Date('2026-09-30T17:24:00Z') }), row({ Created: new Date('2026-07-01T00:00:00Z') })];
	assert.deepEqual(suggestPeriod(rows), { from: '2026-09', to: '2026-09' });
});

test('a filled Resolved at cell that is not a date fails and names the ticket instead of counting it open', () => {
	assert.throws(() => buildSupportReport([row({ 'Issue key': 'BAD-2', 'Resolved at': '9/1:/2026  15:30' })], CONFIG, SEPT), /Resolved at.*BAD-2/);
});

test('tickets count by organization only when the file has an Organizations column', () => {
	const rows = [row({ Organizations: 'DC IT' }), row({ Organizations: 'DC IT' }), row({ Organizations: 'DC Change' })];
	assert.deepEqual(buildSupportReport(rows, CONFIG, SEPT)[0].byOrganization, { 'DC IT': 2, 'DC Change': 1 });
	assert.equal(buildSupportReport([row()], CONFIG, SEPT)[0].byOrganization, null);
});

test('a row with anything in the Хасах column is left out of every count', () => {
	const rows = [
		row({ 'Issue key': 'KEEP', Хасах: null }),
		row({ 'Issue key': 'DROP', Хасах: 'GP-тэй давхардсан', 'Хэтэрсэн хоног': 2 }),
		row({ 'Issue key': 'DROP-PREV', Хасах: 'x', Created: new Date('2026-08-01T00:00:00Z'), 'Resolved at': null }),
	];
	const [report] = buildSupportReport(rows, CONFIG, SEPT);
	assert.deepEqual([report.total, report.carriedOver.length, report.penalties.tickets.length], [1, 0, 0]);
});
