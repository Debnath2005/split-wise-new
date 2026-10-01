import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  MeResponseSchema,
  type ChangePasswordRequest,
  type LoginRequest,
  type SignupRequest,
  type UpdateMeRequest,
  type User,
} from '@split-wise/shared';
import { ApiRequestError, api } from './client';

export const meQueryKey = ['me'] as const;

/** The logged-in user, or null when logged out (401 is not an error here). */
export function useMe() {
  return useQuery({
    queryKey: meQueryKey,
    queryFn: async (): Promise<User | null> => {
      try {
        return (await api('GET', '/auth/me', { schema: MeResponseSchema })).user;
      } catch (err) {
        if (err instanceof ApiRequestError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: 5 * 60 * 1000,
  });
}

function useSetMe() {
  const queryClient = useQueryClient();
  return (user: User | null) => queryClient.setQueryData(meQueryKey, user);
}

export function useSignup() {
  const setMe = useSetMe();
  return useMutation({
    mutationFn: (body: SignupRequest) =>
      api('POST', '/auth/signup', { body, schema: MeResponseSchema }),
    onSuccess: ({ user }) => setMe(user),
  });
}

export function useLogin() {
  const setMe = useSetMe();
  return useMutation({
    mutationFn: (body: LoginRequest) =>
      api('POST', '/auth/login', { body, schema: MeResponseSchema }),
    onSuccess: ({ user }) => setMe(user),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api('POST', '/auth/logout'),
    onSuccess: () => {
      queryClient.clear();
      queryClient.setQueryData(meQueryKey, null);
    },
  });
}

export function useUpdateMe() {
  const setMe = useSetMe();
  return useMutation({
    mutationFn: (body: UpdateMeRequest) => api('PATCH', '/me', { body, schema: MeResponseSchema }),
    onSuccess: ({ user }) => setMe(user),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (body: ChangePasswordRequest) => api('POST', '/me/password', { body }),
  });
}
