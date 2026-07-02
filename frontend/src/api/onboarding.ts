import api from "@/lib/axios";
import type { User } from "@/types";

export interface OnboardDebt {
  name: string;
  type: string;
  balance: number;
  originalAmount: number;
  apr: number;
  minimumPayment: number;
  dueDate: number;
  lender?: string;
  termMonths?: number;
}

export interface OnboardPayload {
  currency: string;
  monthlyIncome: number;
  debts: OnboardDebt[];
}

export const onboardingApi = {
  complete: async (payload: OnboardPayload) => {
    const { data } = await api.patch<User>("/users/onboard", payload);
    return data;
  },
};
