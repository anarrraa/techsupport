import type { JiraTicket, SlaCycle } from './jira.ts';

export interface ReminderSelection {
	due: JiraTicket[];
	/**
	 * Cycles excluded before any window check: no SLA metric on the ticket, a
	 * completed cycle, an unbreached cycle, or a paused one. Overlaps
	 * `JiraFetchResult.withoutSla`, which counts the first of those four.
	 */
	ineligible: number;
	suppressedOutsideCalendar: number;
	waitingForNextWindow: number;
}

const PRIORITY_ORDER: Record<string, number> = {
	Highest: 0,
	High: 1,
	Medium: 2,
	Low: 3,
	Lowest: 3,
};

export function selectReminderTickets(
	tickets: JiraTicket[],
	now: Date,
	repeatMinutes: number,
	deliveryWindowMinutes: number,
): ReminderSelection {
	const due: JiraTicket[] = [];
	let ineligible = 0;
	let suppressedOutsideCalendar = 0;
	let waitingForNextWindow = 0;

	for (const ticket of tickets) {
		const sla = ticket.firstResponseSla;
		if (!sla || sla.state !== 'ongoing' || !sla.breached || sla.paused) {
			ineligible += 1;
			continue;
		}
		if (!sla.withinCalendarHours) {
			suppressedOutsideCalendar += 1;
			continue;
		}
		if (
			sla.breachTimeEpochMillis === null ||
			!isReminderWindow(
				sla.breachTimeEpochMillis,
				now.getTime(),
				repeatMinutes,
				deliveryWindowMinutes,
			)
		) {
			waitingForNextWindow += 1;
			continue;
		}
		due.push(ticket);
	}

	due.sort((a, b) => {
		const priority = priorityRank(a.priority) - priorityRank(b.priority);
		if (priority !== 0) return priority;
		return overdueMinutes(b, now) - overdueMinutes(a, now) || a.key.localeCompare(b.key);
	});

	return { due, ineligible, suppressedOutsideCalendar, waitingForNextWindow };
}

export function isReminderWindow(
	breachTimeEpochMillis: number,
	nowEpochMillis: number,
	repeatMinutes: number,
	deliveryWindowMinutes: number,
): boolean {
	if (nowEpochMillis < breachTimeEpochMillis) return false;
	const elapsedMinutes = Math.floor((nowEpochMillis - breachTimeEpochMillis) / 60_000);
	return elapsedMinutes % repeatMinutes < deliveryWindowMinutes;
}

/**
 * Working time past the target — what "overdue" means and the only figure a
 * reminder may print beside that word.
 *
 * `elapsedTime` is the wrong field for it: JSM measures that from the cycle
 * starting, so a request breached five minutes ago against a thirty-minute
 * allowance reports thirty-five. `remainingTime` is already the difference, so
 * negating it keeps the arithmetic Jira's rather than recomputing it here
 * (`AGENTS.md`).
 */
export function overdueMinutes(ticket: JiraTicket, now: Date): number {
	return overdueMinutesOf(ticket.firstResponseSla, now);
}

export function overdueMinutesOf(sla: SlaCycle | null, now: Date): number {
	if (!sla) return 0;
	if (sla.remainingMinutes != null) return Math.max(0, -sla.remainingMinutes);
	// Fallback to clock time (less accurate across non-working hours).
	const breachTime = sla.breachTimeEpochMillis;
	if (breachTime === null || breachTime === undefined) return 0;
	return Math.max(0, Math.floor((now.getTime() - breachTime) / 60_000));
}

/**
 * Working time since the request was raised. The escalation matrix states its
 * marks that way, so this is the figure an escalation message quotes — and it
 * is deliberately a different function from `overdueMinutesOf`, because the two
 * were once one field read with two meanings.
 */
export function elapsedSinceRaisedMinutes(sla: SlaCycle | null): number {
	if (!sla?.elapsedMinutes) return 0;
	return Math.max(0, sla.elapsedMinutes);
}

function priorityRank(priority: string): number {
	return PRIORITY_ORDER[priority] ?? 4;
}
