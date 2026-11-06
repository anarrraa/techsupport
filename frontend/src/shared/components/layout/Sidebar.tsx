import { BarChart3, FileText, LayoutDashboard, MessageSquare, Users, X } from "lucide-react";
import { useEffect, useRef, type RefObject } from "react";
import { NavLink } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/shared/i18n";
import { cn } from "@/lib/utils";

const links = [
  { to: "/dashboard", key: "nav.dashboard", icon: LayoutDashboard },
  { to: "/reports", key: "nav.reports", icon: FileText },
  { to: "/teams", key: "nav.teams", icon: Users },
  { to: "/admin-chat", key: "nav.adminChat", icon: MessageSquare },
] as const;

/** Fixed 240px rail on lg+, slide-over drawer below it. */
export function Sidebar({ open, onClose, opener }: { open: boolean; onClose: () => void; opener: RefObject<HTMLElement | null> }) {
  const { t } = useI18n();
  const asideRef = useRef<HTMLElement>(null);
  // Drawer mode: focus moves in; every close path (X, backdrop, link, Escape, widening to lg) returns it to the opener.
  useEffect(() => {
    if (!open) return;
    asideRef.current?.querySelector("button")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const wide = matchMedia("(min-width: 1024px)");
    const onWide = (e: MediaQueryListEvent) => e.matches && onClose();
    document.addEventListener("keydown", onKey);
    wide.addEventListener("change", onWide);
    return () => {
      document.removeEventListener("keydown", onKey);
      wide.removeEventListener("change", onWide);
      if (opener.current?.isConnected) opener.current.focus();
    };
  }, [open, onClose, opener]);
  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={onClose} aria-hidden />}
      <aside
        ref={asideRef}
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r bg-card transition-transform duration-300 lg:visible lg:static lg:translate-x-0",
          // invisible keeps the closed drawer's links out of the Tab order.
          open ? "translate-x-0" : "invisible -translate-x-full",
        )}
      >
        <div className="flex h-16 items-center justify-between px-4">
          <span className="flex items-center gap-2 font-semibold">
            <BarChart3 className="size-5 text-primary" aria-hidden />
            {t("appName")}
          </span>
          {/* transition-colors, not -all: a transitioning visibility would block the focus() above. */}
          <Button variant="ghost" size="icon" className="size-11 transition-colors lg:hidden" onClick={onClose} aria-label={t("menu.close")}>
            <X />
          </Button>
        </div>
        <nav className="flex flex-col gap-1 p-2">
          {links.map(({ to, key, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={onClose}
              className={({ isActive }) =>
                cn(
                  "flex min-h-11 items-center gap-3 rounded-md px-3 text-sm transition-colors duration-200",
                  isActive ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-accent",
                )
              }
            >
              <Icon className="size-4" aria-hidden />
              {t(key)}
            </NavLink>
          ))}
        </nav>
      </aside>
    </>
  );
}
