import { useMutation } from "@tanstack/react-query";
import { api } from "@/utils/api-client";
import type { Locale } from "@/utils/format";

export const useChatQuery = () =>
  useMutation({
    mutationFn: ({ question, locale }: { question: string; locale: Locale }) => api.askChat(question, locale),
  });
