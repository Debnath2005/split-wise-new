import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BalanceSummaryResponseSchema, GroupBalancesResponseSchema } from '@split-wise/shared';
import { api } from './client';
import { friendsKeys } from './friends';
import { groupsKeys } from './groups';

export const balanceKeys = {
  summary: ['balances', 'summary'] as const,
  // Nested under the group so any group invalidation refreshes it.
  group: (groupId: number) => [...groupsKeys.detail(groupId), 'balances'] as const,
};

/** Everything a money change can affect: lists, details, balances, and the activity feed. */
export function useInvalidateMoney() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: groupsKeys.all }),
      queryClient.invalidateQueries({ queryKey: friendsKeys.all }),
      queryClient.invalidateQueries({ queryKey: ['balances'] }),
      queryClient.invalidateQueries({ queryKey: ['activity'] }),
    ]);
}

export function useBalanceSummary() {
  return useQuery({
    queryKey: balanceKeys.summary,
    queryFn: () => api('GET', '/balances/summary', { schema: BalanceSummaryResponseSchema }),
  });
}

export function useGroupBalances(groupId: number) {
  return useQuery({
    queryKey: balanceKeys.group(groupId),
    queryFn: () =>
      api('GET', `/groups/${groupId}/balances`, { schema: GroupBalancesResponseSchema }),
  });
}

export function useRemoveFriend(friendId: number) {
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: () => api('DELETE', `/friends/${friendId}`),
    onSuccess: invalidate,
  });
}

export function useLeaveGroup(groupId: number) {
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: () => api('DELETE', `/groups/${groupId}/members/me`),
    onSuccess: invalidate,
  });
}
