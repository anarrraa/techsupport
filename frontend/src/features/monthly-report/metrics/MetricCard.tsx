import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/shared/i18n";
import type { Metric } from "@/types/metrics";
import { cn } from "@/lib/utils";

interface Props {
  label: string;
  metric: Metric;
  format: (n: number | null) => string;
  /** True when a lower value is better (breaches, response time). */
  lowerIsBetter?: boolean;
}

export function MetricCard({ label, metric, format, lowerIsBetter = false }: Props) {
  return (
    <Card className="gap-2 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-sm font-normal text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent className="px-4">
        <p className="text-3xl font-semibold tabular-nums">{format(metric.value)}</p>
        {metric.previous !== undefined && metric.value !== null && metric.previous !== null && (
          <Delta delta={metric.value - metric.previous} format={format as (n: number) => string} lowerIsBetter={lowerIsBetter} />
        )}
      </CardContent>
    </Card>
  );
}

function Delta({ delta, format, lowerIsBetter }: { delta: number; format: (n: number) => string; lowerIsBetter: boolean }) {
  const { t } = useI18n();
  const good = lowerIsBetter ? delta < 0 : delta > 0;
  const Icon = delta === 0 ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <p
      className={cn(
        "mt-1 flex items-center gap-1 text-xs",
        delta === 0 ? "text-muted-foreground" : good ? "text-healthy" : "text-breached",
      )}
    >
      <Icon className="size-4" aria-hidden />
      {format(Math.abs(delta))} {t("metric.vsLastMonth")}
    </p>
  );
}
