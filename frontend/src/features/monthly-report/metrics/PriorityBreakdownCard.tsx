import { PriorityBadge } from "@/shared/components/common/PriorityBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useI18n } from "@/shared/i18n";
import type { PriorityBreakdown } from "@/types/metrics";
import { formatNumber, formatPercent } from "@/shared/utils/format";

export function PriorityBreakdownCard({ byPriority }: { byPriority: PriorityBreakdown[] }) {
  const { t, locale } = useI18n();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t("priority.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {byPriority.length === 0 && <p className="text-sm text-muted-foreground">{t("state.empty")}</p>}
        {byPriority.map((r) => {
          const compliance = r.tickets > 0 ? 1 - r.breaches / r.tickets : 0;
          return (
            <div key={r.priority} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-sm">
                <PriorityBadge priority={r.priority} />
                <span className="tabular-nums">{formatPercent(compliance, locale)}</span>
              </div>
              <Progress value={compliance * 100} aria-label={r.priority} />
              <p className="text-xs text-muted-foreground">
                {formatNumber(r.tickets, locale)} {t("metric.tickets").toLowerCase()} ·{" "}
                {formatNumber(r.breaches, locale)} {t("metric.breaches").toLowerCase()}
              </p>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
