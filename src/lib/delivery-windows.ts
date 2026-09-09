/**
 * The hours of the working day a reminder may arrive in.
 *
 * GitHub's scheduler is not a clock: measured against their cron times, past
 * runs of this workflow were 45 to 489 minutes late, a median near two hours
 * (`docs/mvp-roadmap.md`). No cron expression fixes that, so the schedule stops
 * being the thing that decides when a message may be sent — a run happens
 * whenever GitHub gets to it, and this decides whether it delivers.
 *
 * That inverts the reliability problem. A late run inside the window still
 * delivers; a run at three in the morning delivers nothing rather than waking
 * someone. One cron per window means at most one run inside each, so "once per
 * window" needs no persisted state.
 */

export interface DeliveryWindow {
	/** Minutes from local midnight, inclusive. */
	startMinutes: number;
	/** Minutes from local midnight, exclusive. */
	endMinutes: number;
}

export interface WindowPolicy {
	windows: DeliveryWindow[];
	/** IANA zone the windows are expressed in. */
	timeZone: string;
}

const HHMM = /^(\d{1,2}):(\d{2})$/;

/** `09:00-12:00,14:00-18:00` */
export function parseWindows(value: string): DeliveryWindow[] {
	const windows: DeliveryWindow[] = [];
	for (const range of value.split(',').map((entry) => entry.trim()).filter(Boolean)) {
		const [from, to] = range.split('-');
		const start = toMinutes(from);
		const end = toMinutes(to);
		if (start === null || end === null || end <= start) {
			throw new Error(
				`REMINDER_WINDOWS entry "${range}" must read HH:MM-HH:MM with the end after the start`,
			);
		}
		windows.push({ startMinutes: start, endMinutes: end });
	}
	if (windows.length === 0) throw new Error('REMINDER_WINDOWS must name at least one window');
	return windows;
}

function toMinutes(value: string | undefined): number | null {
	const match = value?.trim().match(HHMM);
	if (!match) return null;
	const hours = Number(match[1]);
	const minutes = Number(match[2]);
	if (hours > 24 || minutes > 59) return null;
	return hours * 60 + minutes;
}

/**
 * Local minutes past midnight in `timeZone`, and the weekday, read through
 * `Intl` so the zone's own rules apply rather than an offset assumed here.
 */
export function localTime(now: Date, timeZone: string): { minutes: number; weekday: number } {
	const parts = new Intl.DateTimeFormat('en-GB', {
		timeZone,
		hour: '2-digit',
		minute: '2-digit',
		weekday: 'short',
		hour12: false,
	}).formatToParts(now);
	const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
	const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
	return {
		minutes: Number(get('hour')) * 60 + Number(get('minute')),
		weekday: weekdays.indexOf(get('weekday')),
	};
}

export interface WindowDecision {
	deliver: boolean;
	/** Local time, for the run journal — a time of day is not personal data. */
	localTime: string;
	reason: 'inside-window' | 'outside-window' | 'weekend';
}

export function windowDecision(now: Date, policy: WindowPolicy): WindowDecision {
	const { minutes, weekday } = localTime(now, policy.timeZone);
	const clock = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
	if (weekday === 0 || weekday === 6) {
		return { deliver: false, localTime: clock, reason: 'weekend' };
	}
	const inside = policy.windows.some(
		(window) => minutes >= window.startMinutes && minutes < window.endMinutes,
	);
	return {
		deliver: inside,
		localTime: clock,
		reason: inside ? 'inside-window' : 'outside-window',
	};
}
