import type { Locale } from "@/utils/format";
import type { MonthlyReport } from "@/types/report";

import { fetchReport, fetchExport, fetchSupportReport } from './report-requests';

export const CURRENT_MONTH = new Date().toISOString().slice(0, 7);

async function download(month: string, format: 'pdf' | 'excel') {
  save(await fetchExport(month, format), `SLA-Report-${month}.${format === 'pdf' ? 'pdf' : 'xlsx'}`);
}

function save(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  try {
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
  } finally {
    a.remove();
    URL.revokeObjectURL(url);
  }
}

const delay = <T,>(value: T, ms = 200) => new Promise<T>((r) => setTimeout(() => r(value), ms));

export const api = {
  getMonthlyReport: (month: string): Promise<MonthlyReport> => fetchReport(month),
  downloadPDF: (month: string) => download(month, 'pdf'),
  downloadExcel: (month: string) => download(month, 'excel'),
  /** One group per click: each download is its own user gesture, so browsers don't block it. */
  downloadSupportReport: async (...args: Parameters<typeof fetchSupportReport>) => {
    const pdf = await fetchSupportReport(...args);
    save(pdf.blob, pdf.filename);
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
