import { useMutation } from "@tanstack/react-query";
import { api } from "@/shared/utils/api-client";
import type { Locale } from "@/shared/utils/format";

export const useChatQuery = () =>
  useMutation({
    mutationFn: ({ question, locale, client }: { question: string; locale: Locale; client?: string }) =>
      api.askChat(question, locale, client),
  });
