import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ExportActions } from '@/shared/components/ExportActions';
import { SupportReportForm } from '@/features/support-report/SupportReportForm';
import { QueryState } from '@/shared/components/common/QueryState';
import { useI18n } from '@/shared/i18n';
import { CURRENT_MONTH } from '@/shared/utils/api-client';
import { loadArchive, ReportRequestError } from '@/shared/utils/report-requests';
import { formatMonth, formatNumber } from '@/shared/utils/format';

export function ReportsPage() {
  const { t, locale } = useI18n();
  const { data: reports, error, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['report-archive', CURRENT_MONTH], queryFn: () => loadArchive(),
  });
  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-2xl font-semibold">{t('reports.archive')}</h1><p className="mt-2 text-sm text-muted-foreground">{t('reports.archiveDescription')}</p></div>
      <Button className="min-h-11" variant="outline" disabled={isFetching} onClick={() => void refetch()}><RefreshCw className="size-4" aria-hidden />{t('reports.refresh')}</Button>
    </div>
    <SupportReportForm />
    <p className="max-w-prose text-sm leading-6 text-muted-foreground">{t('reports.sampleNote')}</p>
    {isLoading && <QueryState isLoading error={null} />}
    {error && <div role="alert" className="rounded-lg border border-destructive bg-card p-4"><p>{error instanceof ReportRequestError && error.status === 413 ? t('reports.tooLarge') : t('state.error')}</p><Button className="mt-3 min-h-11" variant="outline" disabled={isFetching} onClick={() => void refetch()}>{t('reports.retry')}</Button></div>}
    {!error && reports?.length === 0 && <p className="rounded-lg border bg-card p-6 text-muted-foreground">{t('reports.noArchive')}</p>}
    {!error && <div className="divide-y rounded-lg border bg-card">{reports?.map(report => <article key={report.month} className="flex flex-wrap items-center justify-between gap-4 p-4 md:p-5">
      <div className="space-y-2"><h2 className="font-semibold"><Link className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring" to={`/dashboard?month=${report.month}`}>{formatMonth(report.month, locale)}</Link></h2>
        <dl className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground"><div><dt>{t('reports.observed')}</dt><dd className="font-medium tabular-nums text-foreground">{formatNumber(report.summary.tickets.value ?? 0, locale)}</dd></div><div><dt>{t('metric.breaches')}</dt><dd className="font-medium tabular-nums text-foreground">{formatNumber(report.summary.breaches.value ?? 0, locale)}</dd></div><div><dt>{t('metric.resolutionBreaches')}</dt><dd className="font-medium tabular-nums text-foreground">{formatNumber(report.summary.resolutionBreaches.value ?? 0, locale)}</dd></div></dl>
      </div><ExportActions month={report.month} />
    </article>)}</div>}
  </div>;
}
