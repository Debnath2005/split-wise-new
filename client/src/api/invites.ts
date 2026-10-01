import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  InvitePreviewResponseSchema,
  InviteResponseSchema,
  MeResponseSchema,
} from '@split-wise/shared';
import { meQueryKey } from './auth';
import { api } from './client';

/** Create (or replace) the invite link for a placeholder you're friends with (ADR-0015). */
export function useCreateInvite(placeholderId: number) {
  return useMutation({
    mutationFn: () =>
      api('POST', `/users/${placeholderId}/invite`, { schema: InviteResponseSchema }),
  });
}

export function useInvitePreview(token: string) {
  return useQuery({
    queryKey: ['invite', token],
    queryFn: () => api('GET', `/invites/${token}`, { schema: InvitePreviewResponseSchema }),
    staleTime: Infinity,
  });
}

/** Logged in: merge the invited placeholder into this account. Everything changes, so refetch all. */
export function useAcceptInvite(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api('POST', `/invites/${token}/accept`, { schema: MeResponseSchema }),
    onSuccess: async ({ user }) => {
      await queryClient.invalidateQueries();
      queryClient.setQueryData(meQueryKey, user);
    },
  });
}

export const inviteUrl = (token: string) => `${window.location.origin}/invite/${token}`;
