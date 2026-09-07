import {
	contactFor,
	onCallContact,
	personForJiraAccount,
	projectKeyOf,
	type EscalationConfig,
	type Person,
} from './escalation-config.ts';
import type { ContactLevel, EscalationCandidate, EscalationLevel } from './escalation.ts';
import type { JiraTicket } from './jira.ts';
import { buildDirectMessages } from './reminder-message.ts';

/**
 * Who gets a direct message on this run, and what it says. Pure: it renders and
 * decides, it never sends, so every routing rule in `docs/sla-matrix.md` is unit
 * testable without touching Teams.
 */

export interface PlannedDirectMessage {
	entraObjectId: string;
	level: EscalationLevel;
	/** Chunked message bodies, in order. */
	messages: string[];
	/**
	 * Escalation levels to record once this message is delivered. Empty for the
	 * assignee's first-response reminder, which is governed by the stateless
	 * delivery window instead.
	 */
	records: Array<{ ticketKey: string; level: ContactLevel }>;
}

export interface DirectMessagePlan {
	messages: PlannedDirectMessage[];
	/** Breaches whose assignee has no Entra object id in the directory. */
	unmappedAssignees: number;
	/** Off-hours Critical/High escalations with no on-call contact configured. */
	missingOnCall: number;
}

interface Recipient {
	person: Person;
	level: EscalationLevel;
	tickets: JiraTicket[];
	records: Array<{ ticketKey: string; level: ContactLevel }>;
	onCallName: string | null;
}

export function planDirectMessages(input: {
	/** First-response breaches inside their delivery window. */
	due: JiraTicket[];
	escalations: EscalationCandidate[];
	config: EscalationConfig;
	now: Date;
	maxChars: number;
}): DirectMessagePlan {
	const { due, escalations, config, now, maxChars } = input;
	const recipients = new Map<string, Recipient>();
	let unmappedAssignees = 0;
	let missingOnCall = 0;

	for (const ticket of due) {
		const person = personForJiraAccount(config, ticket.assigneeAccountId);
		if (!person) {
			unmappedAssignees += 1;
			continue;
		}
		add(recipients, person, 1, ticket, null, null);
	}

	for (const candidate of escalations) {
		let onCallName: string | null = null;
		if (candidate.plan.surfaceOnCall) {
			onCallName = onCallContact(config)?.name ?? null;
			if (!onCallName) missingOnCall += 1;
		}
		for (const level of candidate.plan.levels) {
			const person =
				level === 1
					? personForJiraAccount(config, candidate.ticket.assigneeAccountId)
					: contactFor(config, projectKeyOf(candidate.ticket.key), level);
			if (!person) {
				// The assignee leg of an off-hours parallel notification only.
				unmappedAssignees += 1;
				continue;
			}
			add(recipients, person, level, candidate.ticket, candidate.level, onCallName);
		}
	}

	const messages: PlannedDirectMessage[] = [];
	for (const recipient of recipients.values()) {
		messages.push({
			entraObjectId: recipient.person.entraObjectId,
			level: recipient.level,
			records: recipient.records,
			messages: buildDirectMessages({
				recipientName: recipient.person.name,
				level: recipient.level,
				tickets: recipient.tickets,
				now,
				maxChars,
				onCallName: recipient.onCallName,
			}),
		});
	}
	return { messages, unmappedAssignees, missingOnCall };
}

function add(
	recipients: Map<string, Recipient>,
	person: Person,
	level: EscalationLevel,
	ticket: JiraTicket,
	recordLevel: ContactLevel | null,
	onCallName: string | null,
): void {
	const key = `${person.entraObjectId}|${level}`;
	const existing = recipients.get(key);
	const recipient: Recipient =
		existing ?? { person, level, tickets: [], records: [], onCallName: null };
	if (!recipient.tickets.some((known) => known.key === ticket.key)) {
		recipient.tickets.push(ticket);
	}
	if (recordLevel !== null) recipient.records.push({ ticketKey: ticket.key, level: recordLevel });
	recipient.onCallName ??= onCallName;
	recipients.set(key, recipient);
}
