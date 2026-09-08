import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import * as v from 'valibot';

/**
 * The highest escalation level already notified per ticket
 * (`docs/brd-teams-bot-escalation.md` decision 6). This is the only persisted
 * state in the project and exists for exactly one reason: a level must never be
 * notified twice for the same ticket (`AGENTS.md`).
 *
 * The file is restored and saved by the GitHub Actions cache, which can miss.
 * A miss re-notifies a level rather than skipping one, so the failure mode is a
 * duplicate message, never a silent gap in the escalation chain.
 *
 * ponytail: no pruning. One small integer per ticket key; revisit if the file
 * ever gets large enough to matter.
 */

const StateSchema = v.record(
	v.pipe(v.string(), v.minLength(1)),
	v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(5)),
);

export type EscalationState = v.InferOutput<typeof StateSchema>;

export async function readEscalationState(path: string): Promise<EscalationState> {
	let raw: string;
	try {
		raw = await readFile(path, 'utf8');
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
		throw error;
	}

	const result = v.safeParse(StateSchema, JSON.parse(raw) as unknown);
	if (!result.success) {
		throw new Error(
			`Escalation state file at ${path} is not a ticket-to-level map; delete the cache entry to reset it`,
		);
	}
	return result.output;
}

export async function writeEscalationState(path: string, state: EscalationState): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${JSON.stringify(state, null, '\t')}\n`, 'utf8');
}

export function highestNotified(state: EscalationState, ticketKey: string): number {
	return state[ticketKey] ?? 0;
}

export function recordNotified(state: EscalationState, ticketKey: string, level: number): void {
	if (level > highestNotified(state, ticketKey)) state[ticketKey] = level;
}
