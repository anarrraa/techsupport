import type { DeliveryFailureReason } from './teams-bot.ts';
import type { IntroReason, IntroResult } from './reminder-intro.ts';

/**
 * What one scheduled run observed and decided.
 *
 * Every event shape here is deliberately unable to express a request's
 * identity, title, assignee, or link. That is the enforcement of the invariant
 * in AGENTS.md and the definition of done in docs/mvp-roadmap.md: no ticket
 * content or personal data in operational output. Redaction is not a step this
 * module performs, it is a shape its callers cannot escape. The two map-shaped
 * events are keyed by closed unions rather than `string` for that reason: a
 * `Record<string, number>` would have let a caller file a count under a request
 * key or a person's name and still typecheck.
 */

export interface SelectionObserved {
	scanned: number;
	withoutSla: number;
	/** No resolution metric, so no escalation clock to read. */
	withoutResolutionSla: number;
	truncated: boolean;
	due: number;
	ineligible: number;
	suppressedOutsideCalendar: number;
	waitingForNextWindow: number;
}

/** The intro's provenance. Reuses the reason union so a new reason must pick a level. */
export type IntroObserved = Omit<IntroResult, 'text'>;

export type DeliveryObserved =
	| { dryRun: true; messages: number }
	| { dryRun: false; messages: number; delivered: number };

/** Escalation levels that came due this run, counted per level. */
export interface EscalationObserved {
	candidates: number;
	/** Keyed by contractual level, so it cannot hold a request key. */
	byLevel: Partial<Record<'2' | '3' | '4' | '5', number>>;
}

export interface DirectMessagesObserved {
	recipients: number;
	messages: number;
	delivered: number;
	dryRun: boolean;
	/** Breached requests with no participant the directory could resolve. */
	unmappedRecipients: number;
	missingOnCall: number;
	/** Recipients withheld by the staged-rollout gate. */
	suppressedByAllowlist: number;
	/** Keyed by cause, so it cannot hold a recipient. */
	failures: Partial<Record<DeliveryFailureReason, number>>;
}

/** The subset of the runtime logger this module needs. Attributes are structured. */
export interface JournalSink {
	info(message: string, attributes?: Record<string, unknown>): void;
	warn(message: string, attributes?: Record<string, unknown>): void;
}

export interface RunJournal {
	selection(event: SelectionObserved): void;
	intro(event: IntroObserved): void;
	delivery(event: DeliveryObserved): void;
	escalation(event: EscalationObserved): void;
	directMessages(event: DirectMessagesObserved): void;
}

/** Reasons that are ordinary operation rather than a degraded run. */
const EXPECTED_INTRO_REASONS: Record<IntroReason, boolean> = {
	disabled: true,
	unavailable: false,
	timeout: false,
	error: false,
	empty: false,
};

export function createRunJournal(sink: JournalSink): RunJournal {
	return {
		selection(event) {
			sink.info(
				`Scanned ${event.scanned}; ${event.due} due, ${event.ineligible} not breached, `
					+ `${event.suppressedOutsideCalendar} outside calendar, `
					+ `${event.waitingForNextWindow} awaiting window`,
				{ ...event },
			);
		},

		intro({ source, reason, errorName }) {
			const attributes = { source, reason, errorName };
			if (source === 'model') {
				sink.info('Reminder intro written by the model', attributes);
				return;
			}
			if (reason && EXPECTED_INTRO_REASONS[reason]) {
				sink.info('Reminder intro used the deterministic opener', attributes);
				return;
			}
			sink.warn(`Reminder intro fell back to the deterministic opener: ${reason}`, attributes);
		},

		escalation(event) {
			const levels = Object.entries(event.byLevel)
				.map(([level, count]) => `L${level}:${count}`)
				.join(' ');
			sink.info(
				`${event.candidates} request(s) crossed an escalation level${levels ? ` (${levels})` : ''}`,
				{ ...event },
			);
		},

		directMessages(event) {
			const failed = Object.values(event.failures).reduce((total, count) => total + count, 0);
			if (event.dryRun) {
				sink.info(
					`Dry run: skipped ${event.messages} direct message(s) to ${event.recipients} recipient(s)`,
					{ ...event },
				);
			} else if (failed === 0) {
				sink.info(
					`Delivered ${event.delivered} direct message(s) to ${event.recipients} recipient(s)`,
					{ ...event },
				);
			} else {
				sink.warn(
					`Delivered ${event.delivered} of ${event.messages} direct message(s); ${failed} recipient(s) failed`,
					{ ...event },
				);
			}
			if (event.unmappedRecipients > 0) {
				sink.warn(
					`${event.unmappedRecipients} breached request(s) have no participant in the escalation directory`,
					{ unmappedRecipients: event.unmappedRecipients },
				);
			}
			if (event.suppressedByAllowlist > 0) {
				sink.info(
					`Staged rollout withheld ${event.suppressedByAllowlist} recipient(s) outside the allowlist`,
					{ suppressedByAllowlist: event.suppressedByAllowlist },
				);
			}
			if (event.missingOnCall > 0) {
				sink.warn(
					`${event.missingOnCall} off-hours escalation(s) could not name an on-call contact`,
					{ missingOnCall: event.missingOnCall },
				);
			}
		},

		delivery(event) {
			if (event.dryRun) {
				sink.info(`Dry run: skipped ${event.messages} Teams message(s)`, { ...event });
				return;
			}
			if (event.delivered === event.messages) {
				sink.info(`Delivered ${event.delivered} Teams message(s)`, { ...event });
				return;
			}
			sink.warn(
				`Delivered ${event.delivered} of ${event.messages} Teams message(s); the rest were not sent`,
				{ ...event },
			);
		},
	};
}
