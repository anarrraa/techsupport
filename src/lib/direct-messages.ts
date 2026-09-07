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
	/** Recipients the policy selected but the staged-rollout gate withheld. */
	suppressedByAllowlist: number;
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
	/** Entra object ids allowed to receive a message; null means everyone. */
	allowlist?: string[] | null;
}): DirectMessagePlan {
	const { due, escalations, config, now, maxChars } = input;
	const allowlist = normalizeAllowlist(input.allowlist, config);
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
	let suppressedByAllowlist = 0;
	for (const recipient of recipients.values()) {
		if (allowlist && !allowlist.has(recipient.person.entraObjectId.toLowerCase())) {
			// Withheld, not recorded: the level stays un-notified so it is delivered
			// once the gate opens rather than being lost.
			suppressedByAllowlist += 1;
			continue;
		}
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
	return { messages, unmappedAssignees, missingOnCall, suppressedByAllowlist };
}

/**
 * A typo here would silently deliver nothing, so an id that no one in the
 * directory has is an error rather than a gate that matches nobody.
 */
function normalizeAllowlist(
	allowlist: string[] | null | undefined,
	config: EscalationConfig,
): Set<string> | null {
	if (!allowlist?.length) return null;
	const known = new Set(
		Object.values(config.people).map((person) => person.entraObjectId.toLowerCase()),
	);
	const unknown = allowlist.map((id) => id.toLowerCase()).filter((id) => !known.has(id));
	if (unknown.length > 0) {
		throw new Error(
			`Recipient allowlist has ${unknown.length} object id(s) that no one in the escalation `
				+ 'directory has; check TEAMS_BOT_RECIPIENT_ALLOWLIST against the directory',
		);
	}
	return new Set(allowlist.map((id) => id.toLowerCase()));
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
