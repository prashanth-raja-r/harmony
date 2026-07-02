import api from "@/lib/axios";
import type { MonthlySummary, Transaction, Income, SpendingTrend } from "@/types";

export const moneyApi = {
  summary: async (month?: number, year?: number) => {
    const params = new URLSearchParams();
    if (month) params.set("month", String(month));
    if (year) params.set("year", String(year));
    const { data } = await api.get<MonthlySummary>(`/money/summary?${params}`);
    return data;
  },
  transactions: async (page = 1, limit = 50) => {
    const { data } = await api.get<{ items: Transaction[]; total: number }>(
      `/money/transactions?page=${page}&limit=${limit}`,
    );
    return data;
  },
  addTransaction: async (dto: {
    amount: number;
    description: string;
    date: string;
    categoryId?: string;
    paymentMethod?: string;
  }) => {
    const { data } = await api.post<Transaction>("/money/transactions", dto);
    return data;
  },
  categories: async () => {
    const { data } = await api.get<Array<{ id: string; name: string; icon: string; color: string }>>(
      "/money/categories",
    );
    return data;
  },
  getIncome: async () => {
    const { data } = await api.get<Income[]>("/money/income");
    return data;
  },
  addIncome: async (dto: {
    source: string;
    type: string;
    amount: number;
    frequency: string;
    date: string;
  }) => {
    const { data } = await api.post<Income>("/money/income", dto);
    return data;
  },
  updateIncome: async (
    id: string,
    dto: Partial<{ source: string; type: string; amount: number; frequency: string; date: string }>,
  ) => {
    const { data } = await api.patch<Income>(`/money/income/${id}`, dto);
    return data;
  },
  deleteIncome: async (id: string) => {
    await api.delete(`/money/income/${id}`);
  },
  getBudgets: async (month: number, year: number) => {
    const { data } = await api.get<MonthlySummary["budgetStatus"]>(
      `/money/budgets?month=${month}&year=${year}`,
    );
    return data;
  },
  setBudget: async (dto: {
    categoryId: string;
    amount: number;
    month: number;
    year: number;
  }) => {
    const { data } = await api.post("/money/budgets", dto);
    return data;
  },
  trends: async (months = 6): Promise<SpendingTrend> => {
    const { data } = await api.get<SpendingTrend>(`/money/trends?months=${months}`);
    return data;
  },
};
