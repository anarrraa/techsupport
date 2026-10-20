import type { TeamMember } from "./dashboard";
import type { Metric, PriorityBreakdown, TrendPoint } from "./metrics";

export interface MonthlyReport {
  month: string; // YYYY-MM
  generatedAt: string; // ISO timestamp
  summary: {
    tickets: Metric;
    breaches: Metric;
    compliance: Metric; // 0..1
    avgFirstResponseMinutes: Metric;
  };
  byPriority: PriorityBreakdown[];
  team: TeamMember[];
  trend: TrendPoint[];
}
