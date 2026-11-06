import { useI18n } from "@/shared/i18n";
import type { ChatMessage } from "@/types/dashboard";
import { cn } from "@/lib/utils";

export function ChatBubble({ message }: { message: ChatMessage }) {
  const { locale } = useI18n();
  const mine = message.role === "user";
  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[80%] rounded-lg px-3 py-2 text-sm",
          mine ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground",
        )}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>
        {message.sources && message.sources.length > 0 && (
          <ol className="mt-2 list-decimal space-y-0.5 border-t pt-2 pl-5 text-xs opacity-80">
            {message.sources.map((s, i) => (
              <li key={i} className="break-all">
                {s.path}
                {s.heading && ` › ${s.heading}`}
              </li>
            ))}
          </ol>
        )}
        <time dateTime={message.at} className="mt-1 block text-xs opacity-70">
          {new Intl.DateTimeFormat(locale === "mn" ? "mn-MN" : "en-US", { timeStyle: "short", hour12: false }).format(
            new Date(message.at),
          )}
        </time>
      </div>
    </div>
  );
}
