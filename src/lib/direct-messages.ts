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
	/**
	 * What raised the message, which is not implied by its level: the off-hours
	 * parallel rule puts level 1 in an escalation plan, and rendering that with
	 * the first-response wording and clock printed `0м хэтэрсэн` on a request
	 * whose first-response cycle had long since completed.
	 */
	kind: 'first-response' | 'escalation';
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
	 * Requests whose escalation could not be planned in full — a leg withheld by
	 * the rollout gate, or a recipient the directory could not resolve. Their
	 * level must not be recorded even if the remaining legs deliver, or the
	 * contact who was missed is never told.
	 */
	incompleteEscalations: Set<string>;
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
	kind: 'first-response' | 'escalation';
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
	const incompleteEscalations = new Set<string>();
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
			add(recipients, person, 'first-response', 1, ticket, null, null);
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
			// Level 1 is the people on the request. It used to be the assignee,
			// which stopped being an actionable recipient when first-response
			// reminders moved to the participants — so this leg resolved to
			// nobody and the contract's off-hours "notify L1 and L2 together"
			// reached only L2.
			const people =
				level === 1
					? candidate.ticket.participants
							.map((participant) => personForJiraAccount(config, participant.accountId))
							.filter((person): person is Person => person !== null)
					: [contactFor(config, projectKeyOf(candidate.ticket.key), level)];
			if (people.length === 0) {
				unmappedRecipients += 1;
				incompleteEscalations.add(candidate.ticket.key);
				continue;
			}
			for (const person of people) {
				add(recipients, person, 'escalation', level, candidate.ticket, candidate.level, onCallName);
			}
		}
	}

	const messages: PlannedDirectMessage[] = [];
	let suppressedByAllowlist = 0;
	for (const recipient of recipients.values()) {
		if (allowlist && !allowlist.has(recipient.person.entraObjectId.toLowerCase())) {
			// Withheld, not recorded: the level stays un-notified so it is delivered
			// once the gate opens rather than being lost. Marking the request
			// incomplete is what stops a delivered sibling leg from recording it.
			suppressedByAllowlist += 1;
			for (const record of recipient.records) incompleteEscalations.add(record.ticketKey);
			continue;
		}
		messages.push({
			entraObjectId: recipient.person.entraObjectId,
			kind: recipient.kind,
			level: recipient.level,
			records: recipient.records,
			messages: buildDirectMessages({
				recipientName: recipient.person.name,
				kind: recipient.kind,
				level: recipient.level,
				tickets: recipient.tickets,
				now,
				maxChars,
				onCallName: recipient.onCallName,
			}),
		});
	}
	return { messages, incompleteEscalations, unmappedRecipients, missingOnCall, suppressedByAllowlist };
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
	kind: 'first-response' | 'escalation',
	level: EscalationLevel,
	ticket: JiraTicket,
	recordLevel: ContactLevel | null,
	onCallName: string | null,
): void {
	// Keyed by kind as well as level, so a first-response reminder and an
	// escalation's level-1 leg are never merged into one message with one clock.
	const key = `${person.entraObjectId}|${kind}|${level}`;
	const existing = recipients.get(key);
	const recipient: Recipient =
		existing ?? { person, kind, level, tickets: [], records: [], onCallName: null };
	if (!recipient.tickets.some((known) => known.key === ticket.key)) {
		recipient.tickets.push(ticket);
	}
	if (recordLevel !== null) recipient.records.push({ ticketKey: ticket.key, level: recordLevel });
	recipient.onCallName ??= onCallName;
	recipients.set(key, recipient);
}
