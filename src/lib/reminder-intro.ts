/**
 * The contract for the optional model-written Reminder Intro.
 *
 * Deliberately free of any framework import so everything under src/lib stays
 * loadable without the agent runtime. The Flue binding lives in
 * src/agents/reminder-writer.ts and consumes the two constants below.
 */

/**
 * Everything the model is allowed to see. The reminder workflow cannot hand
 * this module Jira-controlled content: the type is the invariant from
 * AGENTS.md, not a convention about where a JSON.stringify sits.
 */
export interface AggregateCounts {
	ticketCount: number;
	developerCount: number;
	priorities: Record<string, number>;
}

/** Why the deterministic opener was used. Absent when the model wrote the intro. */
export type IntroReason = 'disabled' | 'unavailable' | 'timeout' | 'error' | 'empty';

export interface IntroResult {
	/** Raw model text, unescaped. Undefined when falling back; the renderer owns sanitization. */
	text?: string;
	source: 'model' | 'fallback';
	reason?: IntroReason;
	/** Error name only. Never a message, which can carry Jira content. */
	errorName?: string;
}

export interface ReminderIntroOptions {
	enabled: boolean;
	timeoutMs: number;
	generate?: (input: string, signal: AbortSignal) => Promise<string>;
}

export const REMINDER_INTRO_MODEL = 'google-vertex/gemini-2.5-flash';

export const REMINDER_INTRO_INSTRUCTIONS = [
	'Write one short, polite opening sentence for a Microsoft Teams SLA reminder.',
	'Input contains aggregate counts only: ticketCount, developerCount, and priorities.',
	'Do not invent ticket details, names, links, or numbers.',
	'Default to Mongolian. Output one plain-text line under 160 characters with no sign-off.',
].join('\n');

/**
 * Ask the model for an opening sentence, or report why it did not happen.
 * Never throws and never blocks past `timeoutMs`: a failed intro must not stop
 * a breach reminder from being delivered.
 */
export async function generateReminderIntro(
	counts: AggregateCounts,
	options: ReminderIntroOptions,
): Promise<IntroResult> {
	if (!options.enabled) return { source: 'fallback', reason: 'disabled' };
	if (!options.generate) return { source: 'fallback', reason: 'unavailable' };

	const controller = new AbortController();
	const timeout = setTimeout(() => {
		const error = new Error(`Reminder intro generation timed out after ${options.timeoutMs}ms`);
		error.name = 'TimeoutError';
		controller.abort(error);
	}, options.timeoutMs);

	try {
		const text = await options.generate(serialize(counts), controller.signal);
		// A whitespace-only line is reported as a fallback so the run journal can
		// say so. Deciding what is renderable stays with reminder-message.ts,
		// which substitutes the deterministic opener either way.
		if (text.trim().length === 0) return { source: 'fallback', reason: 'empty' };
		return { text, source: 'model' };
	} catch (error) {
		return {
			source: 'fallback',
			reason: controller.signal.aborted ? 'timeout' : 'error',
			errorName: error instanceof Error ? error.name : 'UnknownError',
		};
	} finally {
		clearTimeout(timeout);
	}
}

/**
 * Field allowlist, not a copy of the type. Rebuilding the object means an extra
 * property on a non-literal caller's value cannot reach the model, which
 * TypeScript's excess-property check alone would not catch.
 */
function serialize(counts: AggregateCounts): string {
	return JSON.stringify({
		ticketCount: counts.ticketCount,
		developerCount: counts.developerCount,
		priorities: counts.priorities,
	});
}
