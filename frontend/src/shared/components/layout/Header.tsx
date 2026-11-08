import { useQuery } from "@tanstack/react-query";
import { Languages, LogOut, Menu, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/shared/i18n";
import { authProblems, fetchMe, SIGN_IN_URL, type AuthProblem } from "@/shared/utils/report-requests";

export function Header({ title, onMenu }: { title: string; onMenu: (button: HTMLButtonElement) => void }) {
  const { t, locale, setLocale } = useI18n();
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => fetchMe(), staleTime: Infinity });
  const [problem, setProblem] = useState<AuthProblem | null>(null);
  useEffect(() => {
    const listen = (e: Event) => setProblem(e.type as AuthProblem);
    authProblems.addEventListener("expired", listen);
    authProblems.addEventListener("failed", listen);
    return () => {
      authProblems.removeEventListener("expired", listen);
      authProblems.removeEventListener("failed", listen);
    };
  }, []);
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try {
      localStorage.setItem("theme", dark ? "dark" : "light");
    } catch {
      // Private mode: the choice just isn't remembered.
    }
  }, [dark]);

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur md:px-6">
      <Button variant="ghost" size="icon" className="size-11 lg:hidden" onClick={(e) => onMenu(e.currentTarget)} aria-label={t("menu.open")}>
        <Menu />
      </Button>
      <h1 className="flex-1 truncate text-lg font-semibold md:text-2xl">{title}</h1>
      <Button
        variant="ghost"
        size="sm"
        className="min-h-11"
        onClick={() => setLocale(locale === "mn" ? "en" : "mn")}
        aria-label={t("lang.toggle")}
      >
        <Languages />
        {locale === "mn" ? "EN" : "МН"}
      </Button>
      <Button variant="ghost" size="icon" className="size-11" onClick={() => setDark(!dark)} aria-label={t("theme.toggle")}>
        {dark ? <Sun /> : <Moon />}
      </Button>
      {problem ? (
        <p role="alert" className="flex items-center gap-2 text-sm">
          <span className="hidden md:inline">{t(problem === "expired" ? "auth.expired" : "auth.failed")}</span>
          <Button asChild size="sm" className="min-h-11">
            <a href={SIGN_IN_URL}>{t("auth.signIn")}</a>
          </Button>
        </p>
      ) : me && (
        <>
          <span className="hidden max-w-48 truncate text-sm text-muted-foreground sm:inline">{me.name}</span>
          {/* POST: a cross-site link cannot sign staff out (the server also checks Origin). */}
          <form method="post" action="/api/auth/logout">
            <Button type="submit" variant="ghost" size="sm" className="min-h-11">
              <LogOut />
              {t("auth.signOut")}
            </Button>
          </form>
        </>
      )}
    </header>
  );
}
