import { septemberReport } from "@/mocks/report-data";
import type { Locale } from "@/utils/format";
import type { MonthlyReport } from "@/types/report";

// ponytail: mock-backed. Swap each body for a fetch to VITE_API_URL when the backend lands;
// hooks and pages keep the same signatures.
// ponytail: single mock month; becomes a month picker when the API serves more.
export const CURRENT_MONTH = septemberReport.month;

const delay = <T,>(value: T, ms = 200) => new Promise<T>((r) => setTimeout(() => r(value), ms));

export const api = {
  getMonthlyReport: (month: string): Promise<MonthlyReport> =>
    month === septemberReport.month
      ? delay(septemberReport)
      : Promise.reject(new Error(`No report for ${month}`)),

  getTeamMetrics: (month: string) => api.getMonthlyReport(month).then((r) => r.team),

  // Canned answer from aggregate counts only; no ticket content.
  askChat: (question: string, locale: Locale): Promise<string> => {
    const { summary } = septemberReport;
    const answer =
      locale === "mn"
        ? `Жишээ хариулт (backend холбогдоогүй): 9-р сард ${summary.tickets.value} хүсэлт, ${summary.breaches.value} SLA зөрчил.`
        : `Sample answer (backend not connected): September had ${summary.tickets.value} requests and ${summary.breaches.value} SLA breaches.`;
    return delay(question.trim() ? answer : "", 400);
  },
};
