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
	/**
	 * Breach-and-participant pairs the directory could not resolve, and breaches
	 * with no vendor participant at all. Counted rather than raised: one person
	 * missing from the directory must not stop everyone else's reminders, and
	 * the channel post still covers them.
	 */
	unmappedRecipients: number;
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
	/**
	 * Who may receive a message, by email, directory handle, or object id. Null
	 * means everyone.
	 */
	allowlist?: string[] | null;
}): DirectMessagePlan {
	const { due, escalations, config, now, maxChars } = input;
	const allowlist = normalizeAllowlist(input.allowlist, config);
	const recipients = new Map<string, Recipient>();
	let unmappedRecipients = 0;
	let missingOnCall = 0;

	// The first-response reminder goes to the request's participants, not its
	// assignee. The assignee is the support team that triages; the participants
	// are the people expected to act. `JiraTicket.participants` is already
	// filtered to vendor staff, so a client contact can never appear here.
	for (const ticket of due) {
		if (ticket.participants.length === 0) {
			unmappedRecipients += 1;
			continue;
		}
		let reached = 0;
		for (const participant of ticket.participants) {
			const person = personForJiraAccount(config, participant.accountId);
			if (!person) continue;
			add(recipients, person, 1, ticket, null, null);
			reached += 1;
		}
		if (reached === 0) unmappedRecipients += 1;
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
				unmappedRecipients += 1;
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
	return { messages, unmappedRecipients, missingOnCall, suppressedByAllowlist };
}

/**
 * Resolves each entry to the object id the sender addresses, accepting whichever
 * of the three identifiers the operator had to hand. A typo would otherwise
 * produce a gate that matches nobody and a run that looks healthy while
 * delivering nothing, so an unrecognised entry is named and raised.
 */
function normalizeAllowlist(
	allowlist: string[] | null | undefined,
	config: EscalationConfig,
): Set<string> | null {
	if (!allowlist?.length) return null;
	const byIdentifier = new Map<string, string>();
	for (const [handle, person] of Object.entries(config.people)) {
		const objectId = person.entraObjectId.toLowerCase();
		byIdentifier.set(objectId, objectId);
		byIdentifier.set(handle.toLowerCase(), objectId);
		if (person.email) byIdentifier.set(person.email.toLowerCase(), objectId);
	}

	const resolved = new Set<string>();
	const unknown: string[] = [];
	for (const entry of allowlist) {
		const objectId = byIdentifier.get(entry.trim().toLowerCase());
		if (objectId) resolved.add(objectId);
		else unknown.push(entry);
	}
	if (unknown.length > 0) {
		throw new Error(
			`Recipient allowlist names ${unknown.join(', ')}, who are not in the escalation `
				+ 'directory; entries are matched by email, directory handle, or object id',
		);
	}
	return resolved;
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
