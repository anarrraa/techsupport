import type { Priority } from "@/types/metrics";

export const priorityBadge: Record<Priority, string> = {
  critical: "bg-priority-critical/15 text-priority-critical",
  high: "bg-priority-high/15 text-priority-high",
  medium: "bg-priority-medium/20 text-yellow-700 dark:text-priority-medium",
  low: "bg-priority-low/15 text-priority-low",
};

export const priorityStroke: Record<Priority, string> = {
  critical: "var(--priority-critical)",
  high: "var(--priority-high)",
  medium: "var(--priority-medium)",
  low: "var(--priority-low)",
};

/** Status from a breach count: none is healthy, a few is a warning. */
export function breachStatus(breaches: number): "healthy" | "warning" | "breached" {
  if (breaches === 0) return "healthy";
  return breaches <= 2 ? "warning" : "breached";
}

export const statusDot = {
  healthy: "bg-healthy",
  warning: "bg-warning",
  breached: "bg-breached",
} as const;
