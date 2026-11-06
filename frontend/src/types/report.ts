import type { TeamMember } from "./dashboard";
import type { Metric, PriorityBreakdown, TrendPoint } from "./metrics";
import type { CaptureCoverage } from "../../../src/monthly-report/monthly-report.ts";

export interface MonthlyReport {
  snapshots: number;
  coverage: CaptureCoverage;
  firstResponseKnown: number;
  firstResponseMissing: number;
  resolutionKnown: number;
  resolutionMissing: number;
  firstResponseBreachRate: number | null;
  resolutionBreachRate: number | null;
  month: string; // YYYY-MM
  generatedAt: string; // ISO timestamp
  summary: {
    tickets: Metric;
    breaches: Metric;
    resolutionBreaches: Metric;
    compliance: Metric; // 0..1
    avgFirstResponseMinutes: Metric | null;
  };
  byPriority: PriorityBreakdown[];
  team: TeamMember[];
  trend: TrendPoint[];
}
