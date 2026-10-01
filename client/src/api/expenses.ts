import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import {
  ExpensePageSchema,
  ExpenseResponseSchema,
  type CreateExpenseRequest,
} from '@split-wise/shared';
import { useInvalidateMoney } from './balances';
import { api } from './client';
import { friendsKeys } from './friends';
import { groupsKeys } from './groups';

export const expenseKeys = {
  detail: (id: number) => ['expenses', id] as const,
  // Nested under groups/friends so invalidating those also refreshes their expense lists.
  group: (groupId: number) => [...groupsKeys.detail(groupId), 'expenses'] as const,
  friend: (friendId: number) => [...friendsKeys.detail(friendId), 'expenses'] as const,
};

const PAGE_SIZE = 20;

function useExpensePages(queryKey: readonly unknown[], path: string) {
  return useInfiniteQuery({
    queryKey,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (pageParam) params.set('before', pageParam);
      return api('GET', `${path}?${params}`, { schema: ExpensePageSchema });
    },
    getNextPageParam: (last) => last.next_cursor,
  });
}

export const useGroupExpenses = (groupId: number) =>
  useExpensePages(expenseKeys.group(groupId), `/groups/${groupId}/expenses`);

export const useFriendExpenses = (friendId: number) =>
  useExpensePages(expenseKeys.friend(friendId), `/friends/${friendId}/expenses`);

export function useExpense(id: number) {
  return useQuery({
    queryKey: expenseKeys.detail(id),
    queryFn: async () =>
      (await api('GET', `/expenses/${id}`, { schema: ExpenseResponseSchema })).expense,
  });
}

export function useCreateExpense() {
  // A new expense can change group lists, friend lists and every balance.
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: (body: CreateExpenseRequest) =>
      api('POST', '/expenses', { body, schema: ExpenseResponseSchema }),
    onSuccess: invalidate,
  });
}
