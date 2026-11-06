import type { MonthlyReport } from '@/types/report';
import { useI18n } from '@/shared/i18n';
import { formatNumber, formatPercent, formatMonth } from '@/shared/utils/format';

export function ReportSpreadsheet({ report, month }: { report: MonthlyReport; month: string }) {
  const { t, locale } = useI18n();
  const n = (value: number) => formatNumber(value, locale);
  const rows = [
    [t('reports.firstResponse'), report.firstResponseKnown, report.firstResponseMissing, report.firstResponseBreachRate],
    [t('reports.resolution'), report.resolutionKnown, report.resolutionMissing, report.resolutionBreachRate],
  ] as const;
  return <section className="space-y-4">
    <h2 className="text-lg font-semibold">{t('reports.data')} · {formatMonth(month, locale)}</h2>
    <p className="max-w-prose text-sm text-muted-foreground">{t('reports.rateNote')}</p>
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full min-w-[560px] text-sm">
        <caption className="sr-only">{t('reports.flags')}</caption>
        <thead className="border-b bg-muted"><tr><th scope="col" className="p-3 text-left">SLA</th><th scope="col" className="p-3 text-right">{t('reports.known')}</th><th scope="col" className="p-3 text-right">{t('reports.missing')}</th><th scope="col" className="p-3 text-right">{t('reports.breachShare')}</th></tr></thead>
        <tbody>{rows.map(([label, known, missing, rate]) => <tr key={label} className="border-b last:border-0"><th scope="row" className="p-3 text-left font-medium">{label}</th><td className="p-3 text-right tabular-nums">{n(known)}</td><td className="p-3 text-right tabular-nums">{n(missing)}</td><td className="p-3 text-right tabular-nums">{rate === null ? '—' : formatPercent(rate, locale)}</td></tr>)}</tbody>
      </table>
    </div>
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full min-w-[480px] text-sm">
        <caption className="sr-only">{t('priority.title')}</caption>
        <thead className="border-b bg-muted"><tr><th scope="col" className="p-3 text-left">{t('reports.priority')}</th><th scope="col" className="p-3 text-right">{t('reports.observed')}</th><th scope="col" className="p-3 text-right">{t('metric.breaches')}</th><th scope="col" className="p-3 text-right">{t('metric.resolutionBreaches')}</th></tr></thead>
        <tbody>{report.byPriority.map(p => <tr key={p.priority} className="border-b last:border-0"><th scope="row" className="p-3 text-left font-medium">{t(`priority.${p.priority}`)}</th><td className="p-3 text-right tabular-nums">{n(p.tickets)}</td><td className="p-3 text-right tabular-nums">{n(p.breaches)}</td><td className="p-3 text-right tabular-nums">{n(p.resolutionBreached)}</td></tr>)}</tbody>
      </table>
    </div>
  </section>;
}
