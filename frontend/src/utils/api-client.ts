import { septemberReport } from "@/mocks/report-data";
import type { Locale } from "@/utils/format";
import { toMonthlyReport, type MonthlyMetrics } from "@/utils/monthly-metrics";
import type { MonthlyReport } from "@/types/report";

// VITE_USE_MOCKS=1 serves the synthetic September report without a backend.
const useMocks = import.meta.env.VITE_USE_MOCKS === "1";

// ponytail: current UTC month only; becomes a month picker when the dashboard needs history.
export const CURRENT_MONTH = useMocks ? septemberReport.month : new Date().toISOString().slice(0, 7);

const delay = <T,>(value: T, ms = 200) => new Promise<T>((r) => setTimeout(() => r(value), ms));

// Same-origin `/api`: Vite proxies it to the backend in dev (vite.config.ts).
async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  getMonthlyReport: (month: string): Promise<MonthlyReport> =>
    useMocks
      ? month === septemberReport.month
        ? delay(septemberReport)
        : Promise.reject(new Error(`No report for ${month}`))
      : getJson<MonthlyMetrics>(`/api/reports/${encodeURIComponent(month)}`).then((m) =>
          toMonthlyReport(m, new Date().toISOString()),
        ),

  getTeamMetrics: (month: string) => api.getMonthlyReport(month).then((r) => r.team),

  // ponytail: no chat endpoint yet, so this stays canned. Aggregate counts only; no ticket content.
  askChat: (question: string, locale: Locale): Promise<string> => {
    const { summary } = septemberReport;
    const answer =
      locale === "mn"
        ? `Жишээ хариулт (backend холбогдоогүй): 9-р сард ${summary.tickets.value} хүсэлт, ${summary.breaches.value} SLA зөрчил.`
        : `Sample answer (backend not connected): September had ${summary.tickets.value} requests and ${summary.breaches.value} SLA breaches.`;
    return delay(question.trim() ? answer : "", 400);
  },
};
