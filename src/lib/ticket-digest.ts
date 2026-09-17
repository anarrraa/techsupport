/**
 * The Ticket Digest: one or two Mongolian sentences per ticket saying where it
 * stopped, what happened last, and who it is sitting on.
 *
 * Two halves, deliberately separated:
 *
 * - **Who owns it** is resolved deterministically, from the escalation
 *   directory's `jiraAccountId` values. A name a model guessed at would be a
 *   name the wrong person gets paged by, so no model decides this.
 * - **What happened** is the only part a model writes, and it is handed a view
 *   with every identity stripped out (`DigestTicketView`). That keeps the
 *   model's blast radius to prose about untrusted text it cannot attribute.
 *
 * Framework-free, like the rest of src/lib. The Flue binding lives in
 * src/agents/digest-writer.ts.
 */

import type { EscalationConfig, Person } from './escalation-config.ts';
import type { JiraComment, JiraTicket } from './jira.ts';

/** Most recent comments handed to the model. Bounded so one chatty ticket cannot dominate the prompt. */
export const DIGEST_COMMENT_LIMIT = 6;
/** Per-comment character budget inside the model view. */
export const DIGEST_COMMENT_CHARS = 400;

export type DigestReason = 'disabled' | 'unavailable' | 'timeout' | 'error' | 'empty' | 'missing';

export interface TicketOwner {
	/** Directory handle, e.g. `dev-batbayar`. Null when no vendor has commented. */
	handle: string | null;
	/** Display name from the directory, never from the Jira comment author. */
	name: string | null;
	/** The newest comment came from someone outside the directory: the ball is on their side. */
	awaitingClient: boolean;
	/** Age of the newest comment in whole minutes, or null when there are none. */
	lastCommentAgeMinutes: number | null;
}

export interface TicketDigest extends TicketOwner {
	/** One or two plain-text sentences. Unescaped; the renderer owns sanitization. */
	text: string;
	source: 'model' | 'fallback';
	reason?: DigestReason;
}

/**
 * Everything the model is allowed to see about one ticket. No names, no account
 * ids, no URLs — `side` is the whole of the identity, which is all the prose
 * needs and all an injected comment could ever learn.
 */
export interface DigestTicketView {
	key: string;
	priority: string;
	status: string;
	summary: string;
	unresolvedMinutes: number;
	comments: { side: 'vendor' | 'client'; agoMinutes: number; text: string }[];
}

/**
 * Resolve the person a ticket is currently waiting on.
 *
 * Newest comment first: the last vendor voice on the thread is who the team
 * actually asks about it, which is a better answer than the assignee field,
 * and the only one that survives a ticket being passed around informally.
 */
export function resolveTicketOwner(
	ticket: JiraTicket,
	config: EscalationConfig,
	now: Date,
): TicketOwner {
	const ordered = [...ticket.comments].sort(
		(a, b) => b.createdEpochMillis - a.createdEpochMillis,
	);
	const newest = ordered[0];
	const lastCommentAgeMinutes = newest
		? Math.max(0, Math.floor((now.getTime() - newest.createdEpochMillis) / 60_000))
		: null;

	let handle: string | null = null;
	let person: Person | null = null;
	for (const comment of ordered) {
		const found = directoryEntryFor(config, comment.authorAccountId);
		if (found) {
			handle = found[0];
			person = found[1];
			break;
		}
	}

	return {
		handle,
		name: person?.name ?? null,
		awaitingClient: newest ? directoryEntryFor(config, newest.authorAccountId) === null : false,
		lastCommentAgeMinutes,
	};
}

/** True when this comment's author is in the escalation directory, i.e. one of ours. */
export function isVendorComment(config: EscalationConfig, comment: JiraComment): boolean {
	return directoryEntryFor(config, comment.authorAccountId) !== null;
}

/** The identity-free view of a ticket, ready to be serialized into the prompt. */
export function toDigestView(
	ticket: JiraTicket,
	config: EscalationConfig,
	now: Date,
	unresolvedMinutes: number,
): DigestTicketView {
	const recent = [...ticket.comments]
		.sort((a, b) => a.createdEpochMillis - b.createdEpochMillis)
		.slice(-DIGEST_COMMENT_LIMIT);
	return {
		key: ticket.key,
		priority: ticket.priority,
		status: ticket.status,
		summary: clip(ticket.summary, 200),
		unresolvedMinutes,
		comments: recent.map((comment) => ({
			side: isVendorComment(config, comment) ? 'vendor' : 'client',
			agoMinutes: Math.max(0, Math.floor((now.getTime() - comment.createdEpochMillis) / 60_000)),
			text: clip(comment.body, DIGEST_COMMENT_CHARS),
		})),
	};
}

/**
 * The sentence used when the model is off, slow, or wrong. Says strictly what
 * the structured fields already prove, so it is never more confident than the
 * data — a reminder with no digest at all is worse than a plain one.
 */
export function fallbackDigestText(view: DigestTicketView, owner: TicketOwner): string {
	if (view.comments.length === 0) {
		return `${view.status} төлөвт, одоог хүртэл ямар ч тайлбар бичигдээгүй.`;
	}
	const age = formatAge(owner.lastCommentAgeMinutes ?? 0);
	const side = owner.awaitingClient ? 'үйлчлүүлэгч талаас' : 'манай талаас';
	const who = owner.name ? `Сүүлд ${owner.name} хариулсан` : 'Сүүлд манай талаас хариу алга';
	return `${who}; хамгийн сүүлийн бичлэг ${age} өмнө ${side}. Төлөв: ${view.status}.`;
}

function directoryEntryFor(
	config: EscalationConfig,
	accountId: string | null,
): [string, Person] | null {
	if (!accountId) return null;
	for (const [handle, person] of Object.entries(config.people)) {
		if (person.jiraAccountId === accountId) return [handle, person];
	}
	return null;
}

function formatAge(minutes: number): string {
	if (minutes < 60) return `${minutes} минутын`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours} цагийн`;
	return `${Math.floor(hours / 24)} өдрийн`;
}

function clip(value: string, max: number): string {
	const line = value.replace(/\s+/g, ' ').trim();
	return line.length <= max ? line : `${line.slice(0, max - 1)}…`;
}
