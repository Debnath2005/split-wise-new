import { useQuery } from '@tanstack/react-query';
import { HealthResponseSchema } from '@split-wise/shared';
import { apiGet } from './client';

export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: () => apiGet('/health', HealthResponseSchema),
    retry: false,
  });
}
