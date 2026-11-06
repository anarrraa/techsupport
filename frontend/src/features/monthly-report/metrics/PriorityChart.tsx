import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/shared/i18n";
import type { PriorityBreakdown } from "@/types/metrics";

export function PriorityChart({ byPriority }: { byPriority: PriorityBreakdown[] }) {
  const { t } = useI18n();
  const axis = { fontSize: 12, fill: "var(--muted-foreground)" };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t("chart.title")}</CardTitle>
      </CardHeader>
      <CardContent className="h-72 px-2 md:px-6">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={byPriority} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="4 4" vertical={false} />
            <XAxis dataKey="priority" tickFormatter={(p) => t(`priority.${p}` as "priority.high")} tick={axis} stroke="var(--border)" />
            <YAxis tick={axis} allowDecimals={false} stroke="var(--border)" />
            <Tooltip
              labelFormatter={(value) => t(`priority.${value}` as "priority.high")}
              cursor={{ fill: "var(--muted)" }}
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                color: "var(--popover-foreground)",
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="tickets" name={t("metric.tickets")} fill="var(--primary)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="breaches" name={t("metric.breaches")} fill="var(--breached)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="resolutionBreached" name={t("metric.resolutionBreaches")} fill="var(--warning)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
