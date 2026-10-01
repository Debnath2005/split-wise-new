import type { z } from 'zod';
import { ApiErrorSchema } from '@split-wise/shared';

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** GET an API path and validate the response body against a shared schema. */
export async function apiGet<S extends z.ZodType>(path: string, schema: S): Promise<z.infer<S>> {
  const res = await fetch(`/api/v1${path}`, {
    headers: { Accept: 'application/json', 'X-Requested-With': 'fetch' },
    credentials: 'same-origin',
  });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const parsed = ApiErrorSchema.safeParse(body);
    throw parsed.success
      ? new ApiRequestError(res.status, parsed.data.error.code, parsed.data.error.message)
      : new ApiRequestError(res.status, 'UNKNOWN', `Request failed (${res.status})`);
  }
  return schema.parse(body);
}
