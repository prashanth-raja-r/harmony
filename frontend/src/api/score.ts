import api from "@/lib/axios";
import type { ScoreLatest, ScoreSnapshot } from "@/types";

export const scoreApi = {
  getLatest: async (): Promise<ScoreLatest> => {
    const { data } = await api.get<ScoreLatest>("/score");
    return data;
  },
  snapshot: async (): Promise<ScoreSnapshot> => {
    const { data } = await api.post<ScoreSnapshot>("/score/snapshot");
    return data;
  },
  history: async (limit = 12): Promise<ScoreSnapshot[]> => {
    const { data } = await api.get<ScoreSnapshot[]>(`/score/history?limit=${limit}`);
    return data;
  },
};
