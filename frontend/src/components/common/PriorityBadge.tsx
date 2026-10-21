import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/i18n";
import type { Priority } from "@/types/metrics";
import { priorityBadge } from "@/utils/colors";

const isKnown = (p: string): p is Priority => p in priorityBadge;

/** Jira priority name; ones matching the design palette get its color and translation. */
export function PriorityBadge({ priority }: { priority: string }) {
  const { t } = useI18n();
  const key = priority.toLowerCase();
  return (
    <Badge variant="secondary" className={`rounded-sm ${isKnown(key) ? priorityBadge[key] : ""}`}>
      {isKnown(key) ? t(`priority.${key}`) : priority}
    </Badge>
  );
}
