import { useQuery } from "@tanstack/react-query";
import { api } from "@/utils/api-client";

export const useTeamMetrics = (month: string) =>
  useQuery({ queryKey: ["team", month], queryFn: () => api.getTeamMetrics(month) });
