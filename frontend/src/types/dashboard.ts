export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  at: string; // ISO timestamp
}
