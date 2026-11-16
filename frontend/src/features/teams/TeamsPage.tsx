import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/shared/i18n";
import { addMember, fetchMe, fetchTeam, removeMember, supportErrorText } from "@/shared/utils/report-requests";

// Who may sign in (for-agents/prd-hosting-auth.md). Everyone sees the list; only the superadmin changes it.
// No `me` means loopback dev without login, where the server treats the developer as the admin.
export function TeamsPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => fetchMe(), staleTime: Infinity });
  const { data: team, error: loadError } = useQuery({ queryKey: ["team"], queryFn: () => fetchTeam() });
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canEdit = me === null || me?.superadmin === true;
  const reason = (e: unknown) => supportErrorText(e, { invalid: "", tooLarge: t("state.error"), expired: t("auth.expired"), generic: t("state.error") }).trim();

  async function change(action: () => Promise<void>) {
    setBusy(true); setError(null);
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: ["team"] });
      return true;
    } catch (e) {
      setError(reason(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("teams.title")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("teams.lead")}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {canEdit ? (
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await change(() => addMember(email))) setEmail("");
            }}
          >
            <label htmlFor="member-email" className="sr-only">{t("teams.email")}</label>
            <Input id="member-email" type="email" required maxLength={254} placeholder={t("teams.email")} value={email} onChange={(e) => setEmail(e.target.value)} />
            <Button type="submit" disabled={busy || !email.trim()}>
              <UserPlus aria-hidden /> {t("teams.add")}
            </Button>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">{t("teams.readOnly")}</p>
        )}
        {(error || loadError) && <p role="alert" className="text-sm text-destructive">{error ?? reason(loadError)}</p>}
        <ul className="divide-y rounded-md border">
          {team?.superadmin && (
            <li className="flex min-h-11 items-center justify-between gap-2 px-3">
              <span className="min-w-0 truncate">{team.superadmin}</span>
              <Badge variant="secondary">{t("teams.admin")}</Badge>
            </li>
          )}
          {team?.members.filter((m) => m !== team.superadmin).map((member) => (
            <li key={member} className="flex min-h-11 items-center justify-between gap-2 px-3">
              <span className="min-w-0 truncate">{member}</span>
              {canEdit && (
                <Button variant="ghost" size="icon" className="size-11" disabled={busy} aria-label={`${t("teams.remove")} ${member}`} onClick={() => change(() => removeMember(member))}>
                  <Trash2 aria-hidden />
                </Button>
              )}
            </li>
          ))}
          {team && !team.superadmin && team.members.length === 0 && (
            <li className="px-3 py-3 text-sm text-muted-foreground">{t("teams.empty")}</li>
          )}
        </ul>
      </CardContent>
    </Card>
  );
}
