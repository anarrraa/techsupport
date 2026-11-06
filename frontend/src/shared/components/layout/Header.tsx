import { Languages, Menu, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/shared/i18n";

export function Header({ title, onMenu }: { title: string; onMenu: () => void }) {
  const { t, locale, setLocale } = useI18n();
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
      <Button variant="ghost" size="icon" className="size-11 lg:hidden" onClick={onMenu} aria-label={t("menu.open")}>
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
    </header>
  );
}
