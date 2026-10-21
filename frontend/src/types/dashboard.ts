export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  at: string; // ISO timestamp
}

export interface TeamMember {
  id: string;
  name: string;
  email?: string;
}
