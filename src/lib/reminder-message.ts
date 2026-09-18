import { firstResponseMinutes, severityFor, type EscalationLevel } from './escalation.ts';
import type { JiraTicket } from './jira.ts';
import { elapsedSinceRaisedMinutes, overdueMinutes } from './sla.ts';
import type { TicketDigest } from './ticket-digest.ts';

const DEFAULT_INTRO = 'Манай туршлагатай, хариуцлагатай багийнхан аа, дараах тикетүүдийн SLA хугацаа хэтэрсэн тул шалгаж хариу өгнө үү.';
const CHANNEL_TITLE = '🔔 **First response SLA сануулга**';
const DM_TITLE = '🔔 **Танд хамаарах First response SLA сануулга**';
const DOMAIN_PATTERN = String.raw`(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?\.)+[\p{L}]{2,63}`;
const URL_PATTERN = /[a-z][a-z\d+.-]*:\/\/[^\s<>{}\[\]()]+/giu;
const EMAIL_PATTERN = new RegExp(String.raw`[\p{L}\p{N}._%+-]+@${DOMAIN_PATTERN}`, 'gu');
const DOMAIN_CANDIDATE_PATTERN = new RegExp(DOMAIN_PATTERN, 'gu');
const DANGEROUS_FORMAT_CONTROLS = /[\u00ad\u061c\u180e\u200b\u200e\u200f\u202a-\u202e\u2060-\u206f\ufeff\ufff9-\ufffb]|\u{e0001}|[\u{e0020}-\u{e007f}]/gu;
const C0_C1_CONTROLS = /[\u0000-\u001f\u007f-\u009f]/g;

export type TicketDigests = ReadonlyMap<string, TicketDigest>;

export function buildReminderMessages(
	tickets: JiraTicket[],
	now: Date,
	maxChars: number,
	intro = DEFAULT_INTRO,
	digests?: TicketDigests,
): string[] {
	return buildMessages(
		tickets,
		now,
		maxChars,
		[CHANNEL_TITLE, cleanIntro(intro)],
		'firstResponse',
		digests,
	);
}

/**
 * The same escaped, chunked body as the channel post, addressed to one person.
 * Level 1 is the assignee's own first-response reminder and carries the
 * contractual response window; levels 2-5 are the contract's escalation
 * contacts (`docs/sla-matrix.md` section 2).
 */
export function buildDirectMessages(options: {
	recipientName: string;
	/**
	 * What raised the message. Not derivable from the level: the off-hours
	 * parallel rule puts level 1 in an escalation plan, and reading the level
	 * alone dressed that as a first-response reminder and quoted a
	 * first-response cycle that had already completed.
	 */
	kind: 'first-response' | 'escalation';
	level: EscalationLevel;
	tickets: JiraTicket[];
	now: Date;
	maxChars: number;
	/** Off-hours Critical/High only: named so a human can place the call. */
	onCallName?: string | null;
	/** Per-request digest, by ticket key. Missing keys render the plain row. */
	digests?: TicketDigests;
}): string[] {
	const { recipientName, kind, level, tickets, now, maxChars, onCallName, digests } = options;
	const greeting = `Сайн байна уу, ${cleanField(recipientName, 100)}.`;
	const header =
		kind === 'first-response'
			? [
				DM_TITLE,
				`${greeting} Дараах хүсэлтийн анхны хариу SLA хугацаа хэтэрсэн байна. Одоо хариу бичих эсвэл тикетийг шинэчилнэ үү.`,
			]
			: [
				`🚨 **Эскалаци — L${level}**`,
				`${greeting} Дараах хүсэлт шийдэгдээгүй тул гэрээний L${level} шатанд эскалаци хийгдлээ.`,
			];
	if (onCallName) {
		header.push(
			`⚠️ Ажлын бус цагийн Critical/High: дуудлагын инженер ${cleanField(onCallName, 100)}-тай утсаар холбогдоно уу.`,
		);
	}
	return buildMessages(
		tickets,
		now,
		maxChars,
		header,
		kind === 'first-response' ? 'firstResponse' : 'resolution',
		digests,
	);
}

function buildMessages(
	tickets: JiraTicket[],
	now: Date,
	maxChars: number,
	header: string[],
	clock: Clock,
	digests?: TicketDigests,
): string[] {
	if (tickets.length === 0) return [];
	// The on-call line is the one action the off-hours branch exists to trigger,
	// so it survives into every chunk. Rebuilding the continuation from the
	// title alone dropped it from chunk two onwards.
	const onCall = header.slice(2);
	const continuation = [header[0] as string, 'SLA сануулгын үргэлжлэл:', ...onCall];
	const messages: string[] = [];
	let lines = [...header];
	let ticketCount = 0;

	for (const [assignee, assignedTickets] of groupByAssignee(tickets)) {
		const heading = `**${cleanField(assignee, 100)}**`;
		let headingAdded = false;
		for (const ticket of assignedTickets) {
			let ticketLine = renderTicket(ticket, now, clock, digests?.get(ticket.key));
			const additions = headingAdded ? [ticketLine] : ['', heading, ticketLine];
			if ([...lines, ...additions].join('\n').length > maxChars && ticketCount > 0) {
				messages.push(lines.join('\n'));
				lines = [...continuation];
				ticketCount = 0;
				headingAdded = false;
			}

			if (!headingAdded) {
				lines.push('', heading);
				headingAdded = true;
			}
			const available = maxChars - lines.join('\n').length - 1;
			ticketLine = fitTicketLine(ticketLine, ticket, now, available, clock);
			lines.push(ticketLine);
			ticketCount += 1;
		}
	}
	messages.push(lines.join('\n'));
	return messages;
}

export function cleanIntro(value: string): string {
	const line = normalizeLine(value);
	return line ? truncate(sanitizeText(line), 160) : DEFAULT_INTRO;
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

/**
 * `firstResponse` quotes the first-response clock and reads "overdue";
 * `resolution` quotes the resolution clock and reads "unresolved for", because
 * that is the clock an escalation level came due on.
 */
type Clock = 'firstResponse' | 'resolution';

/** Character budget for the digest sentence, the same treatment a summary gets. */
const DIGEST_CHARS = 300;

function renderTicket(
	ticket: JiraTicket,
	now: Date,
	clock: Clock,
	digest?: TicketDigest,
): string {
	const row = renderTicketRow(ticket, now, clock);
	const digestLine = renderDigestLine(digest);
	return digestLine ? `${row}\n${digestLine}` : row;
}

function renderTicketRow(ticket: JiraTicket, now: Date, clock: Clock): string {
	const summary = cleanField(ticket.summary, 180);
	const priority = cleanField(ticket.priority, 30);
	const status = cleanField(ticket.status, 80);
	const key = cleanField(ticket.key, 50);
	const elapsed =
		clock === 'resolution'
			? `${formatDuration(elapsedSinceRaisedMinutes(ticket.resolutionSla))} шийдэгдээгүй`
			: `${formatDuration(overdueMinutes(ticket, now))} хэтэрсэн`;
	const line = `- [${key}](${ticket.url}) · **${priority}** · ${summary} · ${status} · ${elapsed}`;
	if (clock === 'resolution') return line;
	const severity = severityFor(ticket.priority);
	return severity
		? `${line} · гэрээний хугацаа ${firstResponseMinutes(severity)} мин`
		: line;
}

/**
 * The indented second line: where the request stopped, and who it sits on.
 *
 * The digest text is model output written over client-authored comments, so it
 * is exactly as untrusted as a Jira summary and goes through the same
 * `cleanField`. The owner name comes from the escalation directory rather than
 * the model, and is sanitized too — an operator edits that file by hand.
 */
function renderDigestLine(digest?: TicketDigest): string | null {
	const text = digest ? cleanField(digest.text, DIGEST_CHARS) : '';
	if (!text) return null;
	if (digest?.awaitingClient) return `  ↳ ${text} · Үйлчлүүлэгчийн хариу хүлээж байна`;
	return digest?.name ? `  ↳ ${text} · Одоо: ${cleanField(digest.name, 100)}` : `  ↳ ${text}`;
}

function fitTicketLine(
	line: string,
	ticket: JiraTicket,
	now: Date,
	available: number,
	clock: Clock,
): string {
	if (line.length <= available) return line;
	// The digest goes first. The link and the key are what the reminder owes the
	// reader; the prose is the nicety, so it is dropped whole before the row is
	// compacted into something harder to act on.
	const row = renderTicketRow(ticket, now, clock);
	if (row.length <= available) return row;
	const linkedKey = `[${cleanField(ticket.key, 50)}](${ticket.url})`;
	const elapsed =
		clock === 'resolution'
			? `${formatDuration(elapsedSinceRaisedMinutes(ticket.resolutionSla))} шийдэгдээгүй`
			: `${formatDuration(overdueMinutes(ticket, now))} хэтэрсэн`;
	const compact = `- ${linkedKey} · ${cleanField(ticket.priority, 30)} · ${elapsed}`;
	if (compact.length <= available) return compact;
	const linkOnly = `- ${linkedKey}`;
	if (linkOnly.length <= available) return linkOnly;
	throw new RangeError('Message character limit cannot contain the required Jira ticket link');
}

function formatDuration(minutes: number): string {
	if (minutes < 60) return `${minutes}м`;
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	return rest === 0 ? `${hours}ц` : `${hours}ц ${rest}м`;
}

function cleanField(value: string, max: number): string {
	return truncate(sanitizeText(normalizeLine(value)), max);
}

function normalizeLine(value: string): string {
	return value
		.replace(DANGEROUS_FORMAT_CONTROLS, '')
		.replace(/[\r\n\u2028\u2029]+/g, ' ')
		.replace(/\s+/g, ' ')
		.replace(C0_C1_CONTROLS, '')
		.trim();
}

function sanitizeText(value: string): string {
	return escapeMarkdown(escapeHtml(neutralizeLinks(value)));
}

function escapeMarkdown(value: string): string {
	return value.replace(/([\\`*_{}\[\]()#+!|~])/g, '\\$1');
}

function escapeHtml(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function neutralizeLinks(value: string): string {
	return value
		.replace(URL_PATTERN, neutralizeLinkCandidate)
		.replace(EMAIL_PATTERN, neutralizeLinkCandidate)
		.replace(DOMAIN_CANDIDATE_PATTERN, neutralizeLinkCandidate);
}

function neutralizeLinkCandidate(value: string): string {
	return value.replace(/:/g, '[:]').replace(/@/g, '[@]').replace(/\./g, '[.]');
}

function truncate(value: string, max: number): string {
	if (value.length <= max) return value;
	if (max <= 3) return value.slice(0, max);
	return `${value.slice(0, max - 3)}...`;
}
