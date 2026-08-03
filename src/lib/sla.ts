import type { JiraTicket } from './jira.ts';

export interface ReminderSelection {
	due: JiraTicket[];
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
	let suppressedOutsideCalendar = 0;
	let waitingForNextWindow = 0;

	for (const ticket of tickets) {
		const sla = ticket.firstResponseSla;
		if (!sla || sla.state !== 'ongoing' || !sla.breached || sla.paused) continue;
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

	return { due, suppressedOutsideCalendar, waitingForNextWindow };
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

export function overdueMinutes(ticket: JiraTicket, now: Date): number {
	const breachTime = ticket.firstResponseSla?.breachTimeEpochMillis;
	if (breachTime === null || breachTime === undefined) return 0;
	return Math.max(0, Math.floor((now.getTime() - breachTime) / 60_000));
}

function priorityRank(priority: string): number {
	return PRIORITY_ORDER[priority] ?? 4;
}
