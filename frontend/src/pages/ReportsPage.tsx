import { useState } from "react";
import { PriorityBadge } from "@/components/common/PriorityBadge";
import { QueryState } from "@/components/common/QueryState";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMonthlyReport } from "@/hooks/useMonthlyReport";
import { useI18n } from "@/i18n";
import { CURRENT_MONTH } from "@/utils/api-client";
import { formatMonth, formatNumber, formatPercent, shiftMonth } from "@/utils/format";

// ponytail: fixed last-6-months list; a /api/reports index when frozen MonthlyReport rows exist.
const MONTHS = Array.from({ length: 6 }, (_, i) => shiftMonth(CURRENT_MONTH, -i));

export function ReportsPage() {
  const { t, locale } = useI18n();
  const [month, setMonth] = useState(CURRENT_MONTH);
  const { data: report, isLoading, error } = useMonthlyReport(month);
  const count = (n: number) => formatNumber(n, locale);

  return (
    <div className="space-y-4">
      <nav aria-label={t("reports.title")} className="flex flex-wrap gap-2">
        {MONTHS.map((m) => (
          <Button key={m} size="sm" variant={m === month ? "default" : "outline"} onClick={() => setMonth(m)}>
            {formatMonth(m, locale)}
          </Button>
        ))}
      </nav>
      {!report ? (
        <QueryState isLoading={isLoading} error={error} />
      ) : (
        <>
          <div>
            <h2 className="text-xl font-semibold">
              {t("reports.title")}: {formatMonth(report.month, locale)}
            </h2>
            <p className="text-sm text-muted-foreground">
              {count(report.summary.tickets.value)} {t("metric.tickets").toLowerCase()} · {count(report.snapshots)}{" "}
              {t("reports.snapshots")}
            </p>
          </div>
          <Card>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("priority.title")}</TableHead>
                    <TableHead className="text-right">{t("metric.tickets")}</TableHead>
                    <TableHead className="text-right">{t("metric.breaches")}</TableHead>
                    <TableHead className="text-right">{t("metric.avgResponse")}</TableHead>
                    <TableHead className="text-right">{t("metric.compliance")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.summary.tickets.value === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                        {t("state.empty")}
                      </TableCell>
                    </TableRow>
                  )}
                  {report.byPriority.map((r) => (
                    <TableRow key={r.priority} className="h-14">
                      <TableCell>
                        <PriorityBadge priority={r.priority} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{count(r.tickets)}</TableCell>
                      <TableCell className="text-right tabular-nums">{count(r.breaches)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.avgFirstResponseMinutes !== null ? `${count(r.avgFirstResponseMinutes)}m` : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatPercent(r.tickets > 0 ? 1 - r.breaches / r.tickets : 0, locale)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
