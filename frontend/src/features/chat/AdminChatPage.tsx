import { useQuery } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { useState, type FormEvent } from "react";
import { ChatBubble } from "@/features/chat/ChatBubble";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useChatQuery } from "@/features/chat/useChatQuery";
import { useI18n } from "@/shared/i18n";
import { api } from "@/shared/utils/api-client";
import { ReportRequestError } from "@/shared/utils/report-requests";
import type { ChatMessage } from "@/types/dashboard";

const message = (role: ChatMessage["role"], content: string, sources?: ChatMessage["sources"]): ChatMessage => ({
  id: crypto.randomUUID(),
  role,
  content,
  at: new Date().toISOString(),
  sources,
});

export function AdminChatPage() {
  const { t, locale } = useI18n();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [client, setClient] = useState("");
  const clients = useQuery({ queryKey: ["chat-clients"], queryFn: api.getChatClients });
  const chat = useChatQuery();

  const ask = (question: string) => {
    if (!question.trim() || chat.isPending) return;
    setMessages((m) => [...m, message("user", question)]);
    setDraft("");
    chat.mutate(
      { question, locale, client: client || undefined },
      {
        onSuccess: ({ answer, sources }) => setMessages((m) => [...m, message("assistant", answer, sources)]),
        // 4xx bodies are our own validation messages; anything else stays generic.
        onError: (error) =>
          setMessages((m) => [
            ...m,
            message("assistant", error instanceof ReportRequestError && error.status < 500 ? error.message : t("state.error")),
          ]),
      },
    );
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    ask(draft);
  };

  return (
    <Card className="flex h-[calc(100dvh-8rem)] flex-col gap-0 py-0">
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2 text-xs text-muted-foreground">
        <p className="flex-1">{t("chat.notice")}</p>
        <select
          className="h-8 rounded-md border border-input bg-transparent px-2 text-sm text-foreground"
          aria-label={t("chat.client")}
          value={client}
          onChange={(e) => setClient(e.target.value)}
        >
          <option value="">{t("chat.allClients")}</option>
          {clients.data?.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <CardContent className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-muted-foreground">
            <p>{t("chat.empty")}</p>
            <div className="flex flex-wrap justify-center gap-2">
              {(["chat.suggest1", "chat.suggest2"] as const).map((k) => (
                <Button key={k} variant="outline" size="sm" onClick={() => ask(t(k))}>
                  {t(k)}
                </Button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <ChatBubble key={m.id} message={m} />
        ))}
        {chat.isPending && <p className="text-sm text-muted-foreground">{t("state.loading")}</p>}
      </CardContent>
      <form onSubmit={onSubmit} className="flex gap-2 border-t p-3">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={1000}
          placeholder={t("chat.placeholder")}
          aria-label={t("chat.placeholder")}
          className="h-11"
        />
        <Button type="submit" className="h-11" aria-label={t("chat.send")} disabled={!draft.trim() || chat.isPending}>
          <Send />
          <span className="hidden sm:inline">{t("chat.send")}</span>
        </Button>
      </form>
    </Card>
  );
}
