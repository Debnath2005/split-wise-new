import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AddFriendResponseSchema,
  SettlementResponseSchema,
  UpiLinkResponseSchema,
  type CreateSettlementRequest,
} from '@split-wise/shared';
import { useInvalidateMoney } from './balances';
import { ApiRequestError, api } from './client';
import { friendsKeys } from './friends';

export function useCreateSettlement() {
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: (body: CreateSettlementRequest) =>
      api('POST', '/settlements', { body, schema: SettlementResponseSchema }),
    onSuccess: invalidate,
  });
}

export function useDeleteSettlement() {
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: (id: number) => api('DELETE', `/settlements/${id}`),
    onSuccess: invalidate,
  });
}

/**
 * The UPI link to pay someone (SPEC §8). Resolves to null when they have no UPI ID (422 NO_VPA),
 * so the sheet can fall back to recording a cash payment.
 */
export function useUpiLink(input: {
  toUserId: number;
  amountPaise: number | null;
  groupId: number | null;
  enabled: boolean;
}) {
  const { toUserId, amountPaise, groupId, enabled } = input;
  return useQuery({
    queryKey: ['upi-link', toUserId, amountPaise, groupId],
    enabled: enabled && amountPaise !== null,
    queryFn: async () => {
      const params = new URLSearchParams({
        to: String(toUserId),
        amount_paise: String(amountPaise),
      });
      if (groupId) params.set('group_id', String(groupId));
      try {
        return await api('GET', `/settlements/upi-link?${params}`, {
          schema: UpiLinkResponseSchema,
        });
      } catch (err) {
        if (err instanceof ApiRequestError && err.code === 'NO_VPA') return null;
        throw err;
      }
    },
  });
}

/** Set the UPI ID of a placeholder you created (SPEC §8). */
export function useSetPlaceholderUpi(userId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (upi_vpa: string | null) =>
      api('PATCH', `/users/${userId}`, { body: { upi_vpa }, schema: AddFriendResponseSchema }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: friendsKeys.detail(userId) }),
        queryClient.invalidateQueries({ queryKey: ['upi-link'] }),
      ]),
  });
}
