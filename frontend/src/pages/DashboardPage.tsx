import { QueryState } from "@/components/common/QueryState";
import { MetricCard } from "@/components/metrics/MetricCard";
import { PriorityBreakdownCard } from "@/components/metrics/PriorityBreakdownCard";
import { TrendChart } from "@/components/metrics/TrendChart";
import { TeamPerformanceTable } from "@/components/tables/TeamPerformanceTable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useMonthlyReport } from "@/hooks/useMonthlyReport";
import { useI18n } from "@/i18n";
import { CURRENT_MONTH } from "@/utils/api-client";
import { formatDate, formatDuration, formatMonth, formatNumber, formatPercent } from "@/utils/format";

export function DashboardPage() {
  const { t, locale } = useI18n();
  const { data: report, isLoading, error } = useMonthlyReport(CURRENT_MONTH);
  if (!report) return <QueryState isLoading={isLoading} error={error} />;

  const { summary } = report;
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        {formatMonth(report.month, locale)} · {t("dataAsOf")} {formatDate(report.generatedAt, locale)}
      </p>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label={t("metric.tickets")} metric={summary.tickets} format={(n) => formatNumber(n, locale)} />
        <MetricCard
          label={t("metric.breaches")}
          metric={summary.breaches}
          format={(n) => formatNumber(n, locale)}
          lowerIsBetter
        />
        <MetricCard
          label={t("metric.compliance")}
          metric={summary.compliance}
          format={(n) => formatPercent(n, locale)}
        />
        <MetricCard
          label={t("metric.avgResponse")}
          metric={summary.avgFirstResponseMinutes}
          format={(n) => formatDuration(n, locale)}
          lowerIsBetter
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TrendChart data={report.trend} />
        </div>
        <PriorityBreakdownCard rows={report.byPriority} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("team.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <TeamPerformanceTable members={report.team} />
        </CardContent>
      </Card>
    </div>
  );
}
