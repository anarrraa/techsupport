import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/i18n";
import type { Priority } from "@/types/metrics";
import { priorityBadge } from "@/utils/colors";

export function PriorityBadge({ priority }: { priority: Priority }) {
  const { t } = useI18n();
  return (
    <Badge variant="secondary" className={`rounded-sm ${priorityBadge[priority]}`}>
      {t(`priority.${priority}`)}
    </Badge>
  );
}
