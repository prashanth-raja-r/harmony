import api from "@/lib/axios";
import type { Goal } from "@/types";

export interface CreateGoalDto {
  name: string;
  type: string;
  targetAmount: number;
  currentAmount?: number;
  targetDate?: string | null;
  monthlyContribution?: number | null;
  description?: string | null;
}

export const goalsApi = {
  list: async (): Promise<Goal[]> => {
    const { data } = await api.get<Goal[]>("/goals");
    return data;
  },
  create: async (dto: CreateGoalDto): Promise<Goal> => {
    const { data } = await api.post<Goal>("/goals", dto);
    return data;
  },
  update: async (id: string, dto: Partial<CreateGoalDto & { isCompleted: boolean }>): Promise<Goal> => {
    const { data } = await api.patch<Goal>(`/goals/${id}`, dto);
    return data;
  },
  remove: async (id: string): Promise<void> => {
    await api.delete(`/goals/${id}`);
  },
  addMilestone: async (goalId: string, dto: { title: string; amount: number }) => {
    const { data } = await api.post(`/goals/${goalId}/milestones`, dto);
    return data;
  },
  deleteMilestone: async (goalId: string, milestoneId: string): Promise<void> => {
    await api.delete(`/goals/${goalId}/milestones/${milestoneId}`);
  },
};
