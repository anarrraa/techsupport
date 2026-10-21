export type Priority = "critical" | "high" | "medium" | "low";

/** A headline number plus last month's value, for the trend arrow. */
export interface Metric {
  value: number;
  previous?: number;
}
