import { z } from 'zod';

/** Error envelope for every non-2xx API response (SPEC §10). */
export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const HealthResponseSchema = z.object({
  status: z.enum(['ok', 'error']),
  db: z.enum(['ok', 'error']),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
