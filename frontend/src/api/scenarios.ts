import api from "@/lib/axios";
import type { ScenarioResult } from "@/types";

export const scenariosApi = {
  simulate: async (dto: { type: string; extraPayment?: number; [key: string]: unknown }) => {
    const { data } = await api.post<ScenarioResult>("/scenarios/simulate", dto);
    return data;
  },
};
