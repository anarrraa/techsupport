import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/i18n";
import type { TrendPoint } from "@/types/metrics";
import { formatDate } from "@/utils/format";

export function TrendChart({ data }: { data: TrendPoint[] }) {
  const { t, locale } = useI18n();
  const axis = { fontSize: 12, fill: "var(--muted-foreground)" };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t("trend.title")}</CardTitle>
      </CardHeader>
      <CardContent className="h-72 px-2 md:px-6">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="4 4" vertical={false} />
            <XAxis dataKey="date" tick={axis} tickFormatter={(d: string) => d.slice(8)} stroke="var(--border)" />
            <YAxis tick={axis} allowDecimals={false} stroke="var(--border)" />
            <Tooltip
              labelFormatter={(d) => formatDate(String(d), locale)}
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                color: "var(--popover-foreground)",
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line dataKey="tickets" name={t("trend.tickets")} stroke="var(--primary)" strokeWidth={2} dot={false} />
            <Line dataKey="breaches" name={t("trend.breaches")} stroke="var(--breached)" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
