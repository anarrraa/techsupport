import type { Locale } from "@/utils/format";
import type { MonthlyReport } from "@/types/report";

/** Current UTC month, the same calendar the backend buckets snapshots by. */
export const CURRENT_MONTH = new Date().toISOString().slice(0, 7);

const delay = <T,>(value: T, ms = 200) => new Promise<T>((r) => setTimeout(() => r(value), ms));

async function getJson<T>(path: string): Promise<T> {
  // Same-origin: Vite proxies /api to the backend in dev.
  const res = await fetch(path, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  getMonthlyReport: (month: string) => getJson<MonthlyReport>(`/api/reports/${month}`),

  // ponytail: chat query engine is Phase 3; canned answer, no data at all.
  askChat: (question: string, locale: Locale): Promise<string> => {
    const answer =
      locale === "mn"
        ? "Жишээ хариулт: чат backend-д хараахан холбогдоогүй."
        : "Sample answer: chat is not connected to the backend yet.";
    return delay(question.trim() ? answer : "", 400);
  },
};
