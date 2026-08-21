import type { IntroReason, IntroResult } from './reminder-intro.ts';

/**
 * What one scheduled run observed and decided.
 *
 * Every event shape here is deliberately unable to express a request's
 * identity, title, assignee, or link. That is the enforcement of the invariant
 * in AGENTS.md and the definition of done in docs/mvp-roadmap.md: no ticket
 * content or personal data in operational output. Redaction is not a step this
 * module performs, it is a shape its callers cannot escape.
 */

export interface SelectionObserved {
	scanned: number;
	withoutSla: number;
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

/** The subset of the runtime logger this module needs. Attributes are structured. */
export interface JournalSink {
	info(message: string, attributes?: Record<string, unknown>): void;
	warn(message: string, attributes?: Record<string, unknown>): void;
}

export interface RunJournal {
	selection(event: SelectionObserved): void;
	intro(event: IntroObserved): void;
	delivery(event: DeliveryObserved): void;
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
