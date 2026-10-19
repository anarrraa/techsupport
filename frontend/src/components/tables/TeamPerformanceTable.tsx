import { StatusDot } from "@/components/common/StatusDot";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useI18n } from "@/i18n";
import type { TeamMember } from "@/types/dashboard";
import { formatDuration, formatNumber, formatPercent } from "@/utils/format";

interface Props {
  members: TeamMember[];
  onSelect?: (member: TeamMember) => void;
}

export function TeamPerformanceTable({ members, onSelect }: Props) {
  const { t, locale } = useI18n();
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("team.name")}</TableHead>
          <TableHead className="text-right">{t("team.tickets")}</TableHead>
          <TableHead className="text-right">{t("team.breaches")}</TableHead>
          <TableHead className="hidden text-right md:table-cell">{t("team.avgResponse")}</TableHead>
          <TableHead className="hidden text-right lg:table-cell">{t("team.compliance")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {members.length === 0 && (
          <TableRow>
            <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
              {t("team.empty")}
            </TableCell>
          </TableRow>
        )}
        {members.map((m) => (
          <TableRow key={m.id} className="h-14">
            <TableCell className="font-medium">
              {onSelect ? (
                <button type="button" className="text-left hover:underline" onClick={() => onSelect(m)}>
                  {m.name}
                </button>
              ) : (
                m.name
              )}
            </TableCell>
            <TableCell className="text-right tabular-nums">{formatNumber(m.tickets, locale)}</TableCell>
            <TableCell className="text-right tabular-nums">
              <span className="inline-flex items-center gap-2">
                <StatusDot breaches={m.breaches} />
                {formatNumber(m.breaches, locale)}
              </span>
            </TableCell>
            <TableCell className="hidden text-right tabular-nums md:table-cell">
              {formatDuration(m.avgFirstResponseMinutes, locale)}
            </TableCell>
            <TableCell className="hidden text-right tabular-nums lg:table-cell">
              {formatPercent(1 - m.breaches / m.tickets, locale)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
