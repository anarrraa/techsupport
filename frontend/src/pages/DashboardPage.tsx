import { QueryState } from "@/components/common/QueryState";
import { MetricCard } from "@/components/metrics/MetricCard";
import { PriorityBreakdownCard } from "@/components/metrics/PriorityBreakdownCard";
import { PriorityChart } from "@/components/metrics/PriorityChart";
import { Card, CardContent } from "@/components/ui/card";
import { useMonthlyReport } from "@/hooks/useMonthlyReport";
import { useI18n } from "@/i18n";
import type { MonthlyReport } from "@/types/report";
import { CURRENT_MONTH } from "@/utils/api-client";
import { formatMonth, formatNumber, formatPercent, shiftMonth } from "@/utils/format";

export function DashboardPage() {
  const { t, locale } = useI18n();
  const { data: report, isLoading, error } = useMonthlyReport(CURRENT_MONTH);
  const { data: last } = useMonthlyReport(shiftMonth(CURRENT_MONTH, -1));
  if (!report) return <QueryState isLoading={isLoading} error={error} />;

  const count = (n: number | null) => (n !== null ? formatNumber(n, locale) : "—");
  const count0 = (n: number) => formatNumber(n, locale);
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        {formatMonth(report.month, locale)} · {count0(report.snapshots)} {t("reports.snapshots")}
      </p>
      {report.summary.tickets.value === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground">{t("state.empty")}</CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <MetricCard label={t("metric.tickets")} metric={report.summary.tickets} format={count} />
            <MetricCard
              label={t("metric.breaches")}
              metric={report.summary.breaches}
              format={count}
              lowerIsBetter
            />
            <MetricCard
              label={t("metric.compliance")}
              metric={report.summary.compliance}
              format={(n) => (n !== null ? formatPercent(n, locale) : "—")}
            />
            <MetricCard
              label={t("metric.avgResponse")}
              metric={report.summary.avgFirstResponseMinutes}
              format={(n) => (n !== null ? `${formatNumber(n, locale)}m` : "—")}
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <PriorityChart byPriority={report.byPriority} />
            </div>
            <PriorityBreakdownCard byPriority={report.byPriority} />
          </div>
        </>
      )}
    </div>
  );
}
