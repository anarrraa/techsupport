import type { JiraTicket } from './jira.ts';
import { overdueMinutes } from './sla.ts';

const DEFAULT_INTRO = 'Багийнхаан, дараах тикетүүдийн анхны хариу өгөх SLA хэтэрсэн байна.';

export function buildReminderMessages(
	tickets: JiraTicket[],
	now: Date,
	maxChars: number,
	intro = DEFAULT_INTRO,
): string[] {
	if (tickets.length === 0) return [];
	const messages: string[] = [];
	let lines = headerLines(cleanIntro(intro));
	let ticketCount = 0;

	for (const [assignee, assignedTickets] of groupByAssignee(tickets)) {
		const heading = `**${cleanField(assignee, 100)}**`;
		let headingAdded = false;
		for (const ticket of assignedTickets) {
			let ticketLine = renderTicket(ticket, now);
			const additions = headingAdded ? [ticketLine] : ['', heading, ticketLine];
			if ([...lines, ...additions].join('\n').length > maxChars && ticketCount > 0) {
				messages.push(lines.join('\n'));
				lines = headerLines('SLA сануулгын үргэлжлэл:');
				ticketCount = 0;
				headingAdded = false;
			}

			if (!headingAdded) {
				lines.push('', heading);
				headingAdded = true;
			}
			const available = maxChars - lines.join('\n').length - 1;
			ticketLine = fitTicketLine(ticketLine, ticket, now, available);
			lines.push(ticketLine);
			ticketCount += 1;
		}
	}
	messages.push(lines.join('\n'));
	return messages;
}

export function cleanIntro(value: string): string {
	const line = normalizeLine(value);
	return line.slice(0, 160) || DEFAULT_INTRO;
}

function groupByAssignee(tickets: JiraTicket[]): Map<string, JiraTicket[]> {
	const groups = new Map<string, JiraTicket[]>();
	for (const ticket of tickets) {
		const list = groups.get(ticket.assignee) ?? [];
		list.push(ticket);
		groups.set(ticket.assignee, list);
	}
	return groups;
}

function headerLines(intro: string): string[] {
	return ['🔔 **First response SLA сануулга**', intro];
}

function renderTicket(ticket: JiraTicket, now: Date): string {
	const summary = cleanField(ticket.summary, 180);
	const priority = cleanField(ticket.priority, 30);
	const status = cleanField(ticket.status, 80);
	const key = cleanField(ticket.key, 50);
	return `- [${key}](${ticket.url}) · **${priority}** · ${summary} · ${status} · ${formatDuration(overdueMinutes(ticket, now))} хэтэрсэн`;
}

function fitTicketLine(line: string, ticket: JiraTicket, now: Date, available: number): string {
	if (line.length <= available) return line;
	const compact = `- ${cleanField(ticket.key, 50)} · ${cleanField(ticket.priority, 30)} · ${formatDuration(overdueMinutes(ticket, now))} хэтэрсэн`;
	if (compact.length <= available) return compact;
	return truncate(compact, Math.max(1, available));
}

function formatDuration(minutes: number): string {
	if (minutes < 60) return `${minutes}м`;
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	return rest === 0 ? `${hours}ц` : `${hours}ц ${rest}м`;
}

function cleanField(value: string, max: number): string {
	return truncate(escapeMarkdown(normalizeLine(value)), max);
}

function normalizeLine(value: string): string {
	return value.replace(/[\r\n\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function escapeMarkdown(value: string): string {
	return value.replace(/([\\`*_\[\]()])/g, '\\$1');
}

function truncate(value: string, max: number): string {
	if (value.length <= max) return value;
	if (max <= 3) return value.slice(0, max);
	return `${value.slice(0, max - 3)}...`;
}
