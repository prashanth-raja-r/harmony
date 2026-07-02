import api from "@/lib/axios";
import type { AppNotification } from "@/types";

export const notificationsApi = {
  getAll: async (): Promise<AppNotification[]> => {
    const { data } = await api.get<AppNotification[]>("/notifications");
    return data;
  },
  getUnreadCount: async (): Promise<{ count: number }> => {
    const { data } = await api.get<{ count: number }>("/notifications/unread-count");
    return data;
  },
  generate: async (): Promise<void> => {
    await api.post("/notifications/generate");
  },
  markRead: async (id: string): Promise<void> => {
    await api.patch(`/notifications/${id}/read`);
  },
  markAllRead: async (): Promise<void> => {
    await api.patch("/notifications/read-all");
  },
  delete: async (id: string): Promise<void> => {
    await api.delete(`/notifications/${id}`);
  },
  clearAll: async (): Promise<void> => {
    await api.delete("/notifications/clear-all");
  },
};
