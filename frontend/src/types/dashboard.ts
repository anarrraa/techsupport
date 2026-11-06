import type { ChatAnswer } from "@backend/docs-chat/chat.ts";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  at: string; // ISO timestamp
  /** Documents the answer was grounded on; citation [n] is sources[n - 1]. */
  sources?: ChatAnswer["sources"];
}

export interface TeamMember {
  id: string;
  name: string;
  email?: string;
}
