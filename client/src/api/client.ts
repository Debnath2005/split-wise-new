import type { z } from 'zod';
import { ApiErrorSchema } from '@split-wise/shared';

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    /** Per-field messages from a VALIDATION_ERROR (SPEC §10 `details.fieldErrors`). */
    readonly fieldErrors: Record<string, string[]> = {},
  ) {
    super(message);
  }
}

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

function readFieldErrors(details: unknown): Record<string, string[]> {
  if (details && typeof details === 'object' && 'fieldErrors' in details) {
    const fe = (details as { fieldErrors: unknown }).fieldErrors;
    if (fe && typeof fe === 'object') return fe as Record<string, string[]>;
  }
  return {};
}

/**
 * Calls `/api/v1{path}`. Always sends `X-Requested-With: fetch` (CSRF, SPEC §12) and validates
 * the JSON response with the given shared schema. 204 responses resolve to undefined.
 */
export async function api<S extends z.ZodType>(
  method: Method,
  path: string,
  options: { body?: unknown; schema?: S } = {},
): Promise<z.infer<S>> {
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      method,
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        'X-Requested-With': 'fetch',
        ...(options.body !== undefined && { 'Content-Type': 'application/json' }),
      },
      ...(options.body !== undefined && { body: JSON.stringify(options.body) }),
    });
  } catch {
    throw new ApiRequestError(0, 'NETWORK', "Can't reach the server. Check your connection.");
  }

  if (res.status === 204) return undefined as z.infer<S>;
  const body: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const parsed = ApiErrorSchema.safeParse(body);
    throw parsed.success
      ? new ApiRequestError(
          res.status,
          parsed.data.error.code,
          parsed.data.error.message,
          readFieldErrors(parsed.data.error.details),
        )
      : new ApiRequestError(res.status, 'UNKNOWN', `Request failed (${res.status})`);
  }
  return options.schema ? options.schema.parse(body) : (body as z.infer<S>);
}
