import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  GroupDetailResponseSchema,
  GroupsResponseSchema,
  type AddGroupMemberRequest,
  type CreateGroupRequest,
} from '@split-wise/shared';
import { api } from './client';
import { friendsKeys } from './friends';

export const groupsKeys = {
  all: ['groups'] as const,
  detail: (id: number) => ['groups', id] as const,
};

export function useGroups() {
  return useQuery({
    queryKey: groupsKeys.all,
    queryFn: async () => (await api('GET', '/groups', { schema: GroupsResponseSchema })).groups,
  });
}

export function useGroup(id: number, { enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: groupsKeys.detail(id),
    enabled,
    queryFn: async () =>
      (await api('GET', `/groups/${id}`, { schema: GroupDetailResponseSchema })).group,
  });
}

/** Group changes can create friendships and rename shared groups, so refresh both lists. */
function useInvalidateGroupsAndFriends() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: groupsKeys.all }),
      queryClient.invalidateQueries({ queryKey: friendsKeys.all }),
      queryClient.invalidateQueries({ queryKey: ['activity'] }),
    ]);
}

export function useCreateGroup() {
  const invalidate = useInvalidateGroupsAndFriends();
  return useMutation({
    mutationFn: (body: CreateGroupRequest) =>
      api('POST', '/groups', { body, schema: GroupDetailResponseSchema }),
    onSuccess: invalidate,
  });
}

export function useRenameGroup(id: number) {
  const invalidate = useInvalidateGroupsAndFriends();
  return useMutation({
    mutationFn: (name: string) =>
      api('PATCH', `/groups/${id}`, { body: { name }, schema: GroupDetailResponseSchema }),
    onSuccess: invalidate,
  });
}

export function useAddGroupMember(id: number) {
  const invalidate = useInvalidateGroupsAndFriends();
  return useMutation({
    mutationFn: (body: AddGroupMemberRequest) =>
      api('POST', `/groups/${id}/members`, { body, schema: GroupDetailResponseSchema }),
    onSuccess: invalidate,
  });
}
