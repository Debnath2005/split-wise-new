import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AddFriendResponseSchema,
  FriendDetailResponseSchema,
  FriendsResponseSchema,
  type PersonInput,
} from '@split-wise/shared';
import { api } from './client';

export const friendsKeys = {
  all: ['friends'] as const,
  detail: (id: number) => ['friends', id] as const,
};

export function useFriends() {
  return useQuery({
    queryKey: friendsKeys.all,
    queryFn: async () => (await api('GET', '/friends', { schema: FriendsResponseSchema })).friends,
  });
}

export function useFriend(id: number) {
  return useQuery({
    queryKey: friendsKeys.detail(id),
    queryFn: () => api('GET', `/friends/${id}`, { schema: FriendDetailResponseSchema }),
  });
}

export function useAddFriend() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: PersonInput) =>
      api('POST', '/friends', { body, schema: AddFriendResponseSchema }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: friendsKeys.all }),
  });
}
