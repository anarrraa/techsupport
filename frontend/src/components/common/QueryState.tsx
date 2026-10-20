import { AlertTriangle } from "lucide-react";
import { useI18n } from "@/i18n";

/** Loading skeleton or error card for a React Query result. */
export function QueryState({ isLoading, error }: { isLoading: boolean; error: Error | null }) {
  const { t } = useI18n();
  if (isLoading)
    return (
      <div role="status" aria-label={t("state.loading")} className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-lg bg-border" />
        ))}
      </div>
    );
  if (error)
    return (
      <div role="alert" className="flex items-center gap-2 rounded-lg border-2 border-breached p-4 text-breached">
        <AlertTriangle className="size-5" aria-hidden />
        {t("state.error")}
      </div>
    );
  return null;
}
