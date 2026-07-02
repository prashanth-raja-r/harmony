import { useAuthStore } from "@/store/authStore";
import api from "@/lib/axios";
import type { ChatMessage, Insight, QuestionAnswer } from "@/types";

const BASE = import.meta.env.VITE_API_URL || "/api";

export const coachApi = {
  async getInsights(): Promise<Insight[]> {
    const res = await api.get<Insight[]>("/coach/insights");
    return res.data;
  },

  async answerQuestion(questionId: string): Promise<QuestionAnswer> {
    const res = await api.get<QuestionAnswer>(`/coach/answer/${questionId}`);
    return res.data;
  },

  async streamChat(
    message: string,
    history: ChatMessage[],
    onChunk: (text: string) => void,
    signal?: AbortSignal,
  ) {
    const token = useAuthStore.getState().token;
    const messages = [...history, { role: "user" as const, content: message }];
    const res = await fetch(`${BASE}/coach/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ messages }),
      signal,
    });

    if (!res.ok) throw new Error(`Coach error: ${res.status}`);
    if (!res.body) throw new Error("No response body");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") return;
          try {
            const parsed = JSON.parse(payload);
            if (parsed.text) onChunk(parsed.text);
          } catch {
            onChunk(payload);
          }
        }
      }
    }
  },
};
