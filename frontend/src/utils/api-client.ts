import type { Locale } from "@/utils/format";
import type { MonthlyReport } from "@/types/report";

export const CURRENT_MONTH = new Date().toISOString().slice(0, 7);

// Same-origin `/api`: Vite proxies it to the backend in dev (vite.config.ts).
async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

const delay = <T,>(value: T, ms = 200) => new Promise<T>((r) => setTimeout(() => r(value), ms));

export const api = {
  getMonthlyReport: (month: string): Promise<MonthlyReport> =>
    getJson<MonthlyReport>(`/api/reports/${encodeURIComponent(month)}`),

  downloadPDF: async (month: string) => {
    const res = await fetch(`/api/reports/${encodeURIComponent(month)}/export?format=pdf`);
    if (!res.ok) throw new Error(`PDF download failed: ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SLA-Report-${month}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  downloadExcel: async (month: string) => {
    const res = await fetch(`/api/reports/${encodeURIComponent(month)}/export?format=excel`);
    if (!res.ok) throw new Error(`Excel download failed: ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SLA-Report-${month}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  // Chat query engine is Phase 3; for now, return a canned stub. No ticket content, aggregate counts only.
  askChat: (question: string, locale: Locale): Promise<string> => {
    const answer =
      locale === "mn"
        ? "Жишээ хариулт: чат backend-д холбогдоогүй."
        : "Sample answer: chat is not connected to the backend yet.";
    return delay(question.trim() ? answer : "", 400);
  },
};
