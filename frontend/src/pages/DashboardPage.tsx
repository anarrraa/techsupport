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

const compliance = (r: MonthlyReport) => 1 - (r.firstResponseBreachRate ?? 0);

export function DashboardPage() {
  const { t, locale } = useI18n();
  const { data: report, isLoading, error } = useMonthlyReport(CURRENT_MONTH);
  // Last month only drives the trend arrows; a month with no snapshots has nothing to compare.
  const { data: last } = useMonthlyReport(shiftMonth(CURRENT_MONTH, -1));
  if (!report) return <QueryState isLoading={isLoading} error={error} />;

  const prev = last?.tickets ? last : undefined;
  const count = (n: number) => formatNumber(n, locale);
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        {formatMonth(report.month, locale)} · {count(report.snapshots)} {t("reports.snapshots")}
      </p>
      {report.tickets === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground">{t("state.empty")}</CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <MetricCard label={t("metric.tickets")} metric={{ value: report.tickets, previous: prev?.tickets }} format={count} />
            <MetricCard
              label={t("metric.breaches")}
              metric={{ value: report.firstResponseBreached, previous: prev?.firstResponseBreached }}
              format={count}
              lowerIsBetter
            />
            <MetricCard
              label={t("metric.compliance")}
              metric={{ value: compliance(report), previous: prev && compliance(prev) }}
              format={(n) => formatPercent(n, locale)}
            />
            <MetricCard
              label={t("metric.resolutionBreaches")}
              metric={{ value: report.resolutionBreached, previous: prev?.resolutionBreached }}
              format={count}
              lowerIsBetter
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
