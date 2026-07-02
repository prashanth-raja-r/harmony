import api from "@/lib/axios";
import type { Debt, PayoffStrategies } from "@/types";

export const debtsApi = {
  list: async () => {
    const { data } = await api.get<Debt[]>("/debts");
    return data;
  },
  create: async (dto: Record<string, unknown>) => {
    const { data } = await api.post<Debt>("/debts", dto);
    return data;
  },
  update: async (id: string, dto: Record<string, unknown>) => {
    const { data } = await api.patch<Debt>(`/debts/${id}`, dto);
    return data;
  },
  remove: async (id: string) => {
    await api.delete(`/debts/${id}`);
  },
  markPaidOff: async (id: string) => {
    const { data } = await api.patch<Debt>(`/debts/${id}/paid-off`);
    return data;
  },
  addPayment: async (id: string, dto: { amount: number; paymentDate: string; note?: string }) => {
    const { data } = await api.post(`/debts/${id}/payments`, dto);
    return data;
  },
  confirmEmi: async (id: string) => {
    const { data } = await api.post(`/debts/${id}/confirm-emi`);
    return data;
  },
  strategies: async () => {
    const { data } = await api.get<PayoffStrategies>("/debts/strategies");
    return data;
  },
};
