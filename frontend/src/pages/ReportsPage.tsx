import { PriorityBadge } from "@/components/common/PriorityBadge";
import { QueryState } from "@/components/common/QueryState";
import { TeamPerformanceTable } from "@/components/tables/TeamPerformanceTable";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMonthlyReport } from "@/hooks/useMonthlyReport";
import { useI18n } from "@/i18n";
import { CURRENT_MONTH } from "@/utils/api-client";
import { formatDate, formatDuration, formatMonth, formatNumber, formatPercent } from "@/utils/format";

export function ReportsPage() {
  const { t, locale } = useI18n();
  const { data: report, isLoading, error } = useMonthlyReport(CURRENT_MONTH);
  if (!report) return <QueryState isLoading={isLoading} error={error} />;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">
          {t("reports.title")}: {formatMonth(report.month, locale)}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t("reports.generated")} {formatDate(report.generatedAt, locale)}
        </p>
      </div>
      <Tabs defaultValue="priority">
        <TabsList>
          <TabsTrigger value="priority">{t("reports.tabPriority")}</TabsTrigger>
          <TabsTrigger value="team">{t("reports.tabTeam")}</TabsTrigger>
        </TabsList>
        <Card className="mt-2">
          <CardContent>
            <TabsContent value="priority">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("priority.title")}</TableHead>
                    <TableHead className="text-right">{t("team.tickets")}</TableHead>
                    <TableHead className="text-right">{t("team.breaches")}</TableHead>
                    <TableHead className="hidden text-right md:table-cell">{t("team.avgResponse")}</TableHead>
                    <TableHead className="hidden text-right md:table-cell">{t("priority.goal")}</TableHead>
                    <TableHead className="text-right">{t("team.compliance")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.byPriority.map((r) => (
                    <TableRow key={r.priority} className="h-14">
                      <TableCell>
                        <PriorityBadge priority={r.priority} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(r.tickets, locale)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(r.breaches, locale)}</TableCell>
                      <TableCell className="hidden text-right tabular-nums md:table-cell">
                        {r.avgFirstResponseMinutes === null ? "—" : formatDuration(r.avgFirstResponseMinutes, locale)}
                      </TableCell>
                      <TableCell className="hidden text-right tabular-nums md:table-cell">
                        {r.goalMinutes === null ? "—" : formatDuration(r.goalMinutes, locale)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatPercent(1 - r.breaches / r.tickets, locale)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>
            <TabsContent value="team">
              <TeamPerformanceTable members={report.team} />
            </TabsContent>
          </CardContent>
        </Card>
      </Tabs>
    </div>
  );
}
