import { useSearchParams } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { QueryState } from '@/components/common/QueryState';
import { MetricCard } from '@/components/metrics/MetricCard';
import { PriorityChart } from '@/components/metrics/PriorityChart';
import { ReportSpreadsheet } from '@/components/ReportSpreadsheet';
import { CoverageNotice } from '@/components/reports/CoverageNotice';
import { ExportActions } from '@/components/reports/ExportActions';
import { Button } from '@/components/ui/button';
import { useMonthlyReport } from '@/hooks/useMonthlyReport';
import { useI18n } from '@/i18n';
import { CURRENT_MONTH } from '@/utils/api-client';
import { ReportRequestError } from '@/utils/report-requests';
import { formatMonth, formatNumber } from '@/utils/format';

export function DashboardPage() {
  const { t, locale } = useI18n();
  const [params, setParams] = useSearchParams();
  const requested = params.get('month') ?? '';
  const month = /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(requested) ? requested : CURRENT_MONTH;
  const { data: report, isLoading, isFetching, error, refetch } = useMonthlyReport(month);
  const count = (n: number | null) => n === null ? '—' : formatNumber(n, locale);
  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">{t('reports.title')}</h1>
        <label className="block text-sm text-muted-foreground" htmlFor="report-month">{t('reports.month')}</label>
        <input id="report-month" type="month" min="0001-01" max="9999-12" value={month}
          onChange={e => { if (/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value)) setParams({ month: e.target.value }); }}
          className="min-h-11 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring" />
      </div>
      <div className="flex flex-wrap items-start gap-2">
        <Button className="min-h-11" variant="outline" onClick={() => void refetch()} disabled={isFetching}><RefreshCw className="size-4" aria-hidden />{t('reports.refresh')}</Button>
        <ExportActions key={month} month={month} disabled={!report || report.snapshots === 0 || !!error} />
      </div>
    </div>
    {error && <div role="alert" className="rounded-lg border border-destructive bg-card p-4 text-sm"><p>{error instanceof ReportRequestError && error.status === 413 ? t('reports.tooLarge') : t('state.error')}</p><Button className="mt-3 min-h-11" variant="outline" onClick={() => void refetch()} disabled={isFetching}>{t('reports.retry')}</Button></div>}
    {isLoading && <QueryState isLoading error={null} />}
    {report && !error && <>
      <CoverageNotice report={report} />
      <p className="text-sm text-muted-foreground">{formatMonth(report.month, locale)}</p>
      {report.snapshots === 0 ? <div role="status" className="rounded-lg border bg-card p-6 text-muted-foreground">{t('state.empty')}</div> : <>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label={t('reports.observed')} metric={report.summary.tickets} format={count} />
          <MetricCard label={t('metric.breaches')} metric={report.summary.breaches} format={count} lowerIsBetter />
          <MetricCard label={t('metric.resolutionBreaches')} metric={report.summary.resolutionBreaches} format={count} lowerIsBetter />
          <MetricCard label={t('reports.capturedDays')} metric={{ value: report.coverage.capturedDays, previous: null }} format={count} />
        </div>
        <p className="max-w-prose text-sm text-muted-foreground">{t("reports.priorityNote")}</p>
        <PriorityChart byPriority={report.byPriority} />
        <ReportSpreadsheet report={report} month={report.month} />
      </>}
    </>}
  </div>;
}
