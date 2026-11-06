import type { MonthlyReport } from '../../types/report.ts';
import type { Period } from '@backend/support-report/support-report.ts';
import type { ChatAnswer, Locale } from '@backend/docs-chat/chat.ts';

export class ReportRequestError extends Error {
  readonly status: number;
  constructor(status: number, message = `Report request failed (${status})`) { super(message); this.status = status; }
}

/** Only the current and previous 11 UTC months, independent of local timezone. */
export function archiveMonths(now = new Date()): string[] {
  return Array.from({ length: 12 }, (_, i) => {
    const date = new Date(0);
    date.setUTCFullYear(now.getUTCFullYear(), now.getUTCMonth() - i, 1);
    return date.toISOString().slice(0, 7);
  });
}

export async function fetchReport(month: string, fetcher: typeof fetch = fetch): Promise<MonthlyReport> {
  const response = await fetcher(`/api/reports/${encodeURIComponent(month)}`, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new ReportRequestError(response.status);
  return response.json() as Promise<MonthlyReport>;
}

export async function fetchExport(month: string, format: 'pdf' | 'excel', fetcher: typeof fetch = fetch): Promise<Blob> {
  const response = await fetcher(`/api/reports/${encodeURIComponent(month)}/export?format=${format}`, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new ReportRequestError(response.status);
  return response.blob();
}

export async function loadArchive(read = fetchReport, now = new Date(), active = () => true): Promise<MonthlyReport[]> {
  const reports: MonthlyReport[] = [];
  for (const month of archiveMonths(now)) {
    if (!active()) return reports;
    const report = await read(month);
    if (report.snapshots > 0) reports.push(report);
  }
  return reports;
}

/** Localized lead for a support upload failure; a 4xx server reason (column names, ticket keys) follows as-is. */
export function supportErrorText(e: unknown, text: { invalid: string; tooLarge: string; generic: string }): string {
  if (!(e instanceof ReportRequestError)) return text.generic;
  if (e.status === 413) return text.tooLarge;
  return e.status < 500 ? `${text.invalid} ${e.message}` : text.generic;
}

export type SupportConfig = { id: string; client: string; groups: string[] };

// 4xx bodies are our own validation messages (shown to the uploader); 5xx bodies are never echoed.
async function supportResponse(response: Response): Promise<Response> {
  if (response.ok) return response;
  const reason = response.status < 500 ? await response.json().then((b: { error?: unknown }) => b.error, () => undefined) : undefined;
  throw new ReportRequestError(response.status, typeof reason === 'string' ? reason : undefined);
}

export async function fetchSupportConfigs(fetcher: typeof fetch = fetch): Promise<SupportConfig[]> {
  return (await supportResponse(await fetcher('/api/support-reports/configs', { signal: AbortSignal.timeout(15_000) }))).json();
}

export async function fetchSupportPeriod(file: File, fetcher: typeof fetch = fetch): Promise<Period> {
  const query = new URLSearchParams({ filename: file.name });
  const response = await fetcher(`/api/support-reports/period?${query}`, { method: 'POST', body: file, signal: AbortSignal.timeout(60_000) });
  return (await supportResponse(response)).json();
}

export async function fetchSupportReport(file: File, params: Period & { config: string; group: number }, fetcher: typeof fetch = fetch): Promise<{ blob: Blob; filename: string }> {
  const query = new URLSearchParams({ config: params.config, from: params.from, to: params.to, group: String(params.group), filename: file.name });
  const response = await supportResponse(await fetcher(`/api/support-reports?${query}`, { method: 'POST', body: file, signal: AbortSignal.timeout(60_000) }));
  const encoded = /filename\*=UTF-8''([^;]+)/.exec(response.headers.get('Content-Disposition') ?? '')?.[1];
  return { blob: await response.blob(), filename: encoded ? decodeURIComponent(encoded) : `support-report-${params.group}.pdf` };
}

export async function fetchChatClients(fetcher: typeof fetch = fetch): Promise<string[]> {
  return (await supportResponse(await fetcher('/api/chat/clients', { signal: AbortSignal.timeout(15_000) }))).json();
}

/** No `client` means all clients. */
export async function askChat(question: string, locale: Locale, client?: string, fetcher: typeof fetch = fetch): Promise<ChatAnswer> {
  const response = await fetcher('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, locale, client }),
    signal: AbortSignal.timeout(60_000),
  });
  return (await supportResponse(response)).json();
}
