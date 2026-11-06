import { Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useI18n } from "@/i18n";

// The backend stores no assignee or other person (for-agents/prd-monthly-dashboard.md),
// so there is nothing per-person to show. Needs a PRD change first, not a fetch.
export function TeamsPage() {
  const { t } = useI18n();
  return (
    <Card>
      <CardContent className="flex items-center gap-3 text-muted-foreground">
        <Users className="size-5 shrink-0" aria-hidden />
        <p>{t("teams.unavailable")}</p>
      </CardContent>
    </Card>
  );
}
