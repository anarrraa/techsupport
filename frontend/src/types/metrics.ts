export type Priority = "critical" | "high" | "medium" | "low";

export const PRIORITIES: readonly Priority[] = ["critical", "high", "medium", "low"];

/** One day of the month's trend. */
export interface TrendPoint {
  date: string; // YYYY-MM-DD
  tickets: number;
  breaches: number;
}

/** First Response SLA results for one priority, as reported by Jira. */
export interface PriorityBreakdown {
  priority: Priority;
  tickets: number;
  breaches: number;
  avgFirstResponseMinutes: number | null; // null: backend has no response times yet
  goalMinutes: number | null;
}

/** A headline number plus last month's value, for the trend arrow. null: not available. */
export interface Metric {
  value: number | null;
  previous: number | null;
}
