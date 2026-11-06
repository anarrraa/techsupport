import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/utils/api-client";

export const useMonthlyReport = (month: string) =>
  useQuery({ queryKey: ["report", month], queryFn: () => api.getMonthlyReport(month) });
