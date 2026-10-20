import type { TeamMember } from "@/types/dashboard";
import type { MonthlyReport } from "@/types/report";

// ponytail: synthetic data, no real tickets or staff. Replaced by the API later.
const team: TeamMember[] = [
  { id: "m1", name: "Болд Б.", tickets: 48, breaches: 2, avgFirstResponseMinutes: 38 },
  { id: "m2", name: "Сараа Г.", tickets: 41, breaches: 0, avgFirstResponseMinutes: 27 },
  { id: "m3", name: "Тэмүүлэн Д.", tickets: 37, breaches: 5, avgFirstResponseMinutes: 71 },
  { id: "m4", name: "Номин Э.", tickets: 29, breaches: 1, avgFirstResponseMinutes: 44 },
  { id: "m5", name: "Ганбат О.", tickets: 22, breaches: 3, avgFirstResponseMinutes: 96 },
];

// Deterministic daily pattern: quieter weekends, a few breach spikes.
const trend = Array.from({ length: 30 }, (_, i) => {
  const day = i + 1;
  const weekend = [5, 6].includes(i % 7); // 2026-09-01 is a Tuesday
  return {
    date: `2026-09-${String(day).padStart(2, "0")}`,
    tickets: weekend ? 2 + (day % 3) : 6 + ((day * 7) % 5),
    breaches: [3, 9, 15, 16, 22, 28].includes(day) ? 1 + (day % 2) : 0,
  };
});

const tickets = trend.reduce((n, d) => n + d.tickets, 0);
const breaches = trend.reduce((n, d) => n + d.breaches, 0);

export const septemberReport: MonthlyReport = {
  month: "2026-09",
  generatedAt: "2026-10-01T01:00:00Z",
  summary: {
    tickets: { value: tickets, previous: 161 },
    breaches: { value: breaches, previous: 14 },
    compliance: { value: 1 - breaches / tickets, previous: 1 - 14 / 161 },
    avgFirstResponseMinutes: { value: 52, previous: 61 },
  },
  byPriority: [
    { priority: "critical", tickets: 9, breaches: 1, avgFirstResponseMinutes: 12, goalMinutes: 30 },
    { priority: "high", tickets: 34, breaches: 3, avgFirstResponseMinutes: 41, goalMinutes: 60 },
    { priority: "medium", tickets: 82, breaches: 4, avgFirstResponseMinutes: 58, goalMinutes: 240 },
    { priority: "low", tickets: tickets - 125, breaches: breaches - 8, avgFirstResponseMinutes: 87, goalMinutes: 480 },
  ],
  team,
  trend,
};
