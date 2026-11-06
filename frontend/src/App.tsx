import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "@/shared/components/layout/AppLayout";
import { I18nProvider } from "@/shared/i18n";
import { AdminChatPage } from "@/features/chat/AdminChatPage";
import { DashboardPage } from "@/features/monthly-report/DashboardPage";
import { ReportsPage } from "@/features/reports-archive/ReportsPage";
import { TeamsPage } from "@/features/teams/TeamsPage";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5 * 60_000, retry: 1 } },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/teams" element={<TeamsPage />} />
              <Route path="/admin-chat" element={<AdminChatPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </I18nProvider>
    </QueryClientProvider>
  );
}
