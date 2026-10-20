export interface TeamMember {
  id: string;
  name: string;
  tickets: number;
  breaches: number;
  avgFirstResponseMinutes: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  at: string; // ISO timestamp
}
