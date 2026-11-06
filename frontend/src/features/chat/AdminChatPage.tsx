import { Send } from "lucide-react";
import { useState, type FormEvent } from "react";
import { ChatBubble } from "@/features/chat/ChatBubble";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useChatQuery } from "@/features/chat/useChatQuery";
import { useI18n } from "@/shared/i18n";
import type { ChatMessage } from "@/types/dashboard";

const message = (role: ChatMessage["role"], content: string): ChatMessage => ({
  id: crypto.randomUUID(),
  role,
  content,
  at: new Date().toISOString(),
});

export function AdminChatPage() {
  const { t, locale } = useI18n();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const chat = useChatQuery();

  const ask = (question: string) => {
    if (!question.trim() || chat.isPending) return;
    setMessages((m) => [...m, message("user", question)]);
    setDraft("");
    chat.mutate(
      { question, locale },
      {
        onSuccess: (answer) => setMessages((m) => [...m, message("assistant", answer)]),
        onError: () => setMessages((m) => [...m, message("assistant", t("state.error"))]),
      },
    );
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    ask(draft);
  };

  return (
    <Card className="flex h-[calc(100dvh-8rem)] flex-col gap-0 py-0">
      <p className="border-b px-4 py-2 text-xs text-muted-foreground">{t("chat.notice")}</p>
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
