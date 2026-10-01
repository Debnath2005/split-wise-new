import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ActivityPageSchema, UnreadCountResponseSchema } from '@split-wise/shared';
import { useInvalidateMoney } from './balances';
import { api } from './client';
import { expenseKeys } from './expenses';

export const activityKeys = {
  all: ['activity'] as const,
  feed: ['activity', 'feed'] as const,
  unread: ['activity', 'unread'] as const,
  expense: (expenseId: number) => ['activity', 'expense', expenseId] as const,
};

export function useActivityFeed() {
  return useInfiniteQuery({
    queryKey: activityKeys.feed,
    initialPageParam: null as number | null,
    queryFn: ({ pageParam }) =>
      api('GET', `/activity?limit=30${pageParam ? `&before=${pageParam}` : ''}`, {
        schema: ActivityPageSchema,
      }),
    getNextPageParam: (last) => last.next_cursor,
  });
}

/** One expense's history (SPEC §11 expense detail). */
export function useExpenseHistory(expenseId: number) {
  return useQuery({
    queryKey: activityKeys.expense(expenseId),
    queryFn: () =>
      api('GET', `/activity?limit=50&expense_id=${expenseId}`, { schema: ActivityPageSchema }),
  });
}

/** Drives the dot on the Activity tab. */
export function useUnreadCount() {
  return useQuery({
    queryKey: activityKeys.unread,
    queryFn: async () =>
      (await api('GET', '/activity/unread-count', { schema: UnreadCountResponseSchema })).count,
    refetchInterval: 60_000,
  });
}

/** Marks everything read; only the dot is refreshed, so this visit can still highlight what was new. */
export function useMarkAllRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api('POST', '/activity/read'),
    onSuccess: () => queryClient.setQueryData(activityKeys.unread, 0),
  });
}

export function useRestoreExpense() {
  const invalidate = useInvalidateMoney();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (expenseId: number) => api('POST', `/expenses/${expenseId}/restore`),
    onSuccess: (_data, expenseId) =>
      Promise.all([
        invalidate(),
        queryClient.invalidateQueries({ queryKey: expenseKeys.detail(expenseId) }),
      ]),
  });
}
