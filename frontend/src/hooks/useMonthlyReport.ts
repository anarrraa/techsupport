import { useQuery } from "@tanstack/react-query";
import { api } from "@/utils/api-client";

export const useMonthlyReport = (month: string) =>
  useQuery({ queryKey: ["report", month], queryFn: () => api.getMonthlyReport(month) });
