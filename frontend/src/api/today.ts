import api from "@/lib/axios";
import type { TodayData } from "@/types";

export const todayApi = {
  get: async () => {
    const { data } = await api.get<TodayData>("/today");
    return data;
  },
  completeAction: async (id: string) => {
    const { data } = await api.patch(`/today/${id}/complete`);
    return data;
  },
};
