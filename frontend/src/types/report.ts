/** JSM breach counts for a set of tickets. Mirrors `src/lib/queries/monthly-report.ts`. */
export interface BreachCounts {
  tickets: number;
  firstResponseBreached: number;
  resolutionBreached: number;
}

/** `GET /api/reports/:month`: each ticket's latest snapshot in that UTC month. */
export interface MonthlyReport extends BreachCounts {
  month: string; // YYYY-MM
  snapshots: number;
  firstResponseBreachRate: number | null; // null when the month has no tickets
  resolutionBreachRate: number | null;
  byPriority: Record<string, BreachCounts>; // keyed by Jira priority name
}
