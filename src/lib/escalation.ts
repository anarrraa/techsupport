import type { JiraTicket } from './jira.ts';

/**
 * The contract's escalation chain, from `docs/sla-matrix.md` sections 2 and 3.
 *
 * Every threshold here is elapsed working time on the JSM **resolution** metric,
 * not clock time since the first-response breach: the contract escalates a
 * request that stays unresolved. JSM owns the calendar, so this module never
 * computes working hours itself — it reads what the resolution cycle reports.
 */

export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type EscalationLevel = 1 | 2 | 3 | 4 | 5;
export type ContactLevel = 2 | 3 | 4 | 5;

const SEVERITY_BY_PRIORITY: Record<string, Severity> = {
	Highest: 'critical',
	High: 'high',
	Medium: 'medium',
	Low: 'low',
	Lowest: 'low',
};

/** First response allowance in minutes, `docs/sla-matrix.md` section 1. */
const FIRST_RESPONSE_MINUTES: Record<Severity, number> = {
	critical: 30,
	high: 45,
	medium: 60,
	low: 240,
};

/**
 * Cumulative working minutes from the request being raised, section 2. The
 * contract states each level as "+Xh after the previous level's mark"; these are
 * those marks added up. `null` means the contract sets no clock mark: Low's L5
 * reads "only if SLA breached" with no time, so it is never reached
 * automatically. Escalating an executive on a guessed threshold is worse than
 * not escalating, so this stays null until the client confirms it.
 */
const LEVEL_MINUTES: Record<Severity, Record<ContactLevel, number | null>> = {
	critical: { 2: 240, 3: 480, 4: 780, 5: 1_140 },
	high: { 2: 480, 3: 960, 4: 1_500, 5: 2_100 },
	medium: { 2: 960, 3: 1_920, 4: 2_940, 5: 4_020 },
	low: { 2: 1_920, 3: 3_840, 4: 5_820, 5: null },
};

const CONTACT_LEVELS: ContactLevel[] = [2, 3, 4, 5];

export function severityFor(priority: string): Severity | null {
	return SEVERITY_BY_PRIORITY[priority] ?? null;
}

export function firstResponseMinutes(severity: Severity): number {
	return FIRST_RESPONSE_MINUTES[severity];
}

/** The highest level whose contractual mark the resolution clock has passed. */
export function dueLevel(severity: Severity, elapsedWorkingMinutes: number): ContactLevel | null {
	let due: ContactLevel | null = null;
	for (const level of CONTACT_LEVELS) {
		const threshold = LEVEL_MINUTES[severity][level];
		if (threshold !== null && elapsedWorkingMinutes >= threshold) due = level;
	}
	return due;
}

/**
 * The next level to notify after `highestNotified`, which is not the same thing
 * as the highest mark crossed.
 *
 * The contract escalates "to the next level when the previous doesn't resolve",
 * and the workflow now runs twice a working day — gaps of 300 and 1140 minutes
 * against Critical marks 240, 300 and 360 minutes apart. Jumping to the highest
 * crossed mark would step over L2 entirely, and overnight could step over L2,
 * L3 and L4 in one move, so those contacts would never be told.
 */
export function nextLevel(
	severity: Severity,
	elapsedWorkingMinutes: number,
	highestNotified: number,
): ContactLevel | null {
	for (const level of CONTACT_LEVELS) {
		if (level <= highestNotified) continue;
		const threshold = LEVEL_MINUTES[severity][level];
		if (threshold === null || elapsedWorkingMinutes < threshold) return null;
		return level;
	}
	return null;
}

export interface EscalationPlan {
	/** Levels to notify on this run. L1 is the assignee; L2-L5 come from the directory. */
	levels: EscalationLevel[];
	/** Off-hours Critical/High: surface the on-call NOC contact, a human places the call. */
	surfaceOnCall: boolean;
}

/**
 * Section 3. Working hours escalate sequentially: only the level that just came
 * due is notified. Off-hours Critical/High notify L1 and L2 together and name
 * the on-call engineer. Off-hours Medium/Low stay sequential.
 */
export function planEscalation(
	severity: Severity,
	level: ContactLevel,
	withinCalendarHours: boolean,
): EscalationPlan {
	const offHoursParallel =
		!withinCalendarHours && (severity === 'critical' || severity === 'high');
	if (!offHoursParallel) return { levels: [level], surfaceOnCall: false };
	const levels = new Set<EscalationLevel>([1, 2, level]);
	return { levels: [...levels].sort((a, b) => a - b), surfaceOnCall: true };
}

export interface EscalationCandidate {
	ticket: JiraTicket;
	severity: Severity;
	level: ContactLevel;
	plan: EscalationPlan;
}

/**
 * Tickets whose resolution clock has crossed a level that has not been notified
 * yet. `highestNotified` is the escalation state; a level already recorded for a
 * ticket is never notified again (`AGENTS.md`).
 */
export function selectEscalations(
	tickets: JiraTicket[],
	highestNotified: (ticketKey: string) => number,
): EscalationCandidate[] {
	const candidates: EscalationCandidate[] = [];
	for (const ticket of tickets) {
		const sla = ticket.resolutionSla;
		if (!sla || sla.state !== 'ongoing' || sla.paused) continue;
		if (sla.elapsedMinutes === null) continue;
		const severity = severityFor(ticket.priority);
		if (!severity) continue;
		const level = nextLevel(severity, sla.elapsedMinutes, highestNotified(ticket.key));
		if (level === null) continue;
		candidates.push({
			ticket,
			severity,
			level,
			plan: planEscalation(severity, level, sla.withinCalendarHours),
		});
	}
	return candidates;
}
