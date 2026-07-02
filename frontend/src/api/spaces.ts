import api from "@/lib/axios";
import type { Space, PendingInvite, SpaceDashboard } from "@/types";

export const spacesApi = {
  list: async (): Promise<Space[]> => {
    const { data } = await api.get<Space[]>("/spaces");
    return data;
  },
  invites: async (): Promise<PendingInvite[]> => {
    const { data } = await api.get<PendingInvite[]>("/spaces/invites");
    return data;
  },
  get: async (id: string): Promise<Space> => {
    const { data } = await api.get<Space>(`/spaces/${id}`);
    return data;
  },
  create: async (dto: { name: string; type: string; description?: string }): Promise<Space> => {
    const { data } = await api.post<Space>("/spaces", dto);
    return data;
  },
  update: async (id: string, dto: Partial<{ name: string; description: string }>): Promise<Space> => {
    const { data } = await api.patch<Space>(`/spaces/${id}`, dto);
    return data;
  },
  remove: async (id: string): Promise<void> => {
    await api.delete(`/spaces/${id}`);
  },
  invite: async (spaceId: string, email: string): Promise<Space> => {
    const { data } = await api.post<Space>(`/spaces/${spaceId}/invite`, { email });
    return data;
  },
  acceptInvite: async (memberId: string): Promise<Space> => {
    const { data } = await api.patch<Space>(`/spaces/invites/${memberId}/accept`);
    return data;
  },
  declineInvite: async (memberId: string): Promise<void> => {
    await api.delete(`/spaces/invites/${memberId}`);
  },
  updateMemberRole: async (spaceId: string, userId: string, role: string): Promise<Space> => {
    const { data } = await api.patch<Space>(`/spaces/${spaceId}/members/${userId}/role`, { role });
    return data;
  },
  getDashboard: async (spaceId: string): Promise<SpaceDashboard> => {
    const { data } = await api.get<SpaceDashboard>(`/spaces/${spaceId}/dashboard`);
    return data;
  },
  cancelInvite: async (spaceId: string, memberId: string): Promise<unknown> => {
    const { data } = await api.delete(`/spaces/${spaceId}/pending-members/${memberId}`);
    return data;
  },
  removeMember: async (spaceId: string, userId: string): Promise<unknown> => {
    const { data } = await api.delete(`/spaces/${spaceId}/members/${userId}`);
    return data;
  },
};
