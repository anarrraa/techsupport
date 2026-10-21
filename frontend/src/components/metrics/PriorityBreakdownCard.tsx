import { PriorityBadge } from "@/components/common/PriorityBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useI18n } from "@/i18n";
import type { BreachCounts } from "@/types/report";
import { formatNumber, formatPercent } from "@/utils/format";

export function PriorityBreakdownCard({ byPriority }: { byPriority: Record<string, BreachCounts> }) {
  const { t, locale } = useI18n();
  const rows = Object.entries(byPriority);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t("priority.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.length === 0 && <p className="text-sm text-muted-foreground">{t("state.empty")}</p>}
        {rows.map(([priority, r]) => {
          const compliance = 1 - r.firstResponseBreached / r.tickets;
          return (
            <div key={priority} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-sm">
                <PriorityBadge priority={priority} />
                <span className="tabular-nums">{formatPercent(compliance, locale)}</span>
              </div>
              <Progress value={compliance * 100} aria-label={priority} />
              <p className="text-xs text-muted-foreground">
                {formatNumber(r.tickets, locale)} {t("metric.tickets").toLowerCase()} ·{" "}
                {formatNumber(r.firstResponseBreached, locale)} {t("metric.breaches").toLowerCase()}
              </p>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
