import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useI18n } from "@/shared/i18n";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";

const titles = {
  "/dashboard": "nav.dashboard",
  "/reports": "nav.reports",
  "/teams": "nav.teams",
  "/admin-chat": "nav.adminChat",
} as const;

export function AppLayout() {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const titleKey = titles[pathname as keyof typeof titles] ?? "nav.dashboard";

  return (
    <div className="flex min-h-dvh">
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col bg-muted">
        <Header title={t(titleKey)} onMenu={() => setMenuOpen(true)} />
        <main className="mx-auto w-full max-w-[1400px] flex-1 p-3 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
