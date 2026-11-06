import { useI18n } from '@/shared/i18n';
import type { MonthlyReport } from '@/types/report';
import { formatNumber } from '@/shared/utils/format';

export function CoverageNotice({ report }: { report: MonthlyReport }) {
  const { t, locale } = useI18n();
  const captured = (date: string | null) => date ? `${date.slice(0, 10)} ${date.slice(11, 16)}` : '—';
  return <section aria-label={t('reports.coverage')} className="rounded-lg border bg-card p-4 md:p-5">
    <h2 className="font-semibold">{t('reports.coverage')}</h2>
    <p className="mt-2 max-w-prose text-sm leading-6 text-muted-foreground">{t('reports.sampleNote')}</p>
    <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
      <div><dt className="text-muted-foreground">{t('reports.firstCapture')}</dt><dd className="mt-1 tabular-nums">{captured(report.coverage.firstCapturedAt)}</dd></div>
      <div><dt className="text-muted-foreground">{t('reports.lastCapture')}</dt><dd className="mt-1 tabular-nums">{captured(report.coverage.lastCapturedAt)}</dd></div>
      <div><dt className="text-muted-foreground">{t('reports.capturedDays')} / {t('reports.snapshots')}</dt><dd className="mt-1 tabular-nums">{formatNumber(report.coverage.capturedDays, locale)} / {formatNumber(report.snapshots, locale)}</dd></div>
    </dl>
  </section>;
}
