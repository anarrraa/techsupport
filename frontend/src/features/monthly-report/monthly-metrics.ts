import type { Priority, PriorityBreakdown } from "@/types/metrics";
import type { MonthlyReport } from "@/types/report";

interface BreachCounts {
  tickets: number;
  firstResponseBreached: number;
  resolutionBreached: number;
}

/** `GET /api/reports/:month` body; mirrors `src/monthly-report/monthly-report.ts`. */
export interface MonthlyMetrics extends BreachCounts {
  coverage: MonthlyReport["coverage"];
  firstResponseKnown: number;
  firstResponseMissing: number;
  resolutionKnown: number;
  resolutionMissing: number;
  month: string;
  snapshots: number;
  firstResponseBreachRate: number | null;
  resolutionBreachRate: number | null;
  byPriority: Record<string, BreachCounts>;
}

// Jira priority names per for-agents/sla-matrix.md (assumed mapping).
// ponytail: Lowest folds into low; any other name is left out of the breakdown but still counts in totals.
const PRIORITY_BY_JIRA_NAME: Record<string, Priority> = {
  Highest: "critical",
  High: "high",
  Medium: "medium",
  Low: "low",
  Lowest: "low",
};
const ORDER: Priority[] = ["critical", "high", "medium", "low"];

/**
 * Backend counts to the dashboard's report shape. The backend stores no assignee,
 * daily series, prior month, or response times, so those stay empty or null.
 */
export function toMonthlyReport(m: MonthlyMetrics, generatedAt: string): MonthlyReport {
  const buckets = new Map<Priority, PriorityBreakdown>();
  for (const [name, counts] of Object.entries(m.byPriority)) {
    const priority = PRIORITY_BY_JIRA_NAME[name];
    if (!priority) continue;
    const row = buckets.get(priority) ?? {
      priority,
      tickets: 0,
      breaches: 0,
      resolutionBreached: 0,
      avgFirstResponseMinutes: null,
      goalMinutes: null,
    };
    row.tickets += counts.tickets;
    row.breaches += counts.firstResponseBreached;
    row.resolutionBreached += counts.resolutionBreached;
    buckets.set(priority, row);
  }

  return {
    month: m.month,
    snapshots: m.snapshots,
    generatedAt,
    coverage: m.coverage,
    firstResponseKnown: m.firstResponseKnown, firstResponseMissing: m.firstResponseMissing,
    resolutionKnown: m.resolutionKnown, resolutionMissing: m.resolutionMissing,
    firstResponseBreachRate: m.firstResponseBreachRate,
    resolutionBreachRate: m.resolutionBreachRate,
    summary: {
      tickets: { value: m.tickets, previous: null },
      breaches: { value: m.firstResponseBreached, previous: null },
      resolutionBreaches: { value: m.resolutionBreached, previous: null },
      compliance: {
        value: m.firstResponseBreachRate === null ? null : 1 - m.firstResponseBreachRate,
        previous: null,
      },
      avgFirstResponseMinutes: null,
    },
    byPriority: ORDER.flatMap((p) => buckets.get(p) ?? []),
    team: [],
    trend: [],
  };
}
