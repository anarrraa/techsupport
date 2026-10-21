import { PriorityBadge } from "@/components/common/PriorityBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useI18n } from "@/i18n";
import type { PriorityBreakdown } from "@/types/metrics";
import { formatDuration, formatPercent } from "@/utils/format";

export function PriorityBreakdownCard({ rows }: { rows: PriorityBreakdown[] }) {
  const { t, locale } = useI18n();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t("priority.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.map((r) => {
          const compliance = 1 - r.breaches / r.tickets;
          return (
            <div key={r.priority} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-sm">
                <PriorityBadge priority={r.priority} />
                <span className="tabular-nums">{formatPercent(compliance, locale)}</span>
              </div>
              <Progress value={compliance * 100} aria-label={t(`priority.${r.priority}`)} />
              {r.avgFirstResponseMinutes !== null && r.goalMinutes !== null && (
                <p className="text-xs text-muted-foreground">
                  {formatDuration(r.avgFirstResponseMinutes, locale)} · {t("priority.goal")}{" "}
                  {formatDuration(r.goalMinutes, locale)}
                </p>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
