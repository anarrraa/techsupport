import { useState } from "react";
import { QueryState } from "@/components/common/QueryState";
import { TeamPerformanceTable } from "@/components/tables/TeamPerformanceTable";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useTeamMetrics } from "@/hooks/useTeamMetrics";
import { useI18n } from "@/i18n";
import type { TeamMember } from "@/types/dashboard";
import { CURRENT_MONTH } from "@/utils/api-client";
import { formatDuration, formatMonth, formatNumber, formatPercent } from "@/utils/format";

export function TeamsPage() {
  const { t, locale } = useI18n();
  const { data: team, isLoading, error } = useTeamMetrics(CURRENT_MONTH);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<TeamMember | null>(null);
  if (!team) return <QueryState isLoading={isLoading} error={error} />;

  const q = search.trim().toLocaleLowerCase();
  const members = team.filter((m) => m.name.toLocaleLowerCase().includes(q));
  const compliance = selected ? 1 - selected.breaches / selected.tickets : 0;

  return (
    <div className="space-y-4">
      <Input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t("team.search")}
        aria-label={t("team.search")}
        className="max-w-sm"
      />
      <Card>
        <CardContent>
          <TeamPerformanceTable members={members} onSelect={setSelected} />
        </CardContent>
      </Card>
      <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent>
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{selected.name}</DialogTitle>
                <DialogDescription>{formatMonth(CURRENT_MONTH, locale)}</DialogDescription>
              </DialogHeader>
              <dl className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <dt className="text-xs text-muted-foreground">{t("team.tickets")}</dt>
                  <dd className="text-2xl font-semibold">{formatNumber(selected.tickets, locale)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t("team.breaches")}</dt>
                  <dd className="text-2xl font-semibold text-breached">{formatNumber(selected.breaches, locale)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t("team.avgResponse")}</dt>
                  <dd className="text-2xl font-semibold">{formatDuration(selected.avgFirstResponseMinutes, locale)}</dd>
                </div>
              </dl>
              <div className="space-y-1">
                <p className="flex justify-between text-sm">
                  <span>{t("team.compliance")}</span>
                  <span className="tabular-nums">{formatPercent(compliance, locale)}</span>
                </p>
                <Progress value={compliance * 100} aria-label={t("team.compliance")} />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
