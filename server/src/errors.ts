import type { ApiError } from '@split-wise/shared';

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL';

/** Throw from routes/services; the error middleware turns it into the SPEC §10 envelope. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export function errorBody(code: ErrorCode, message: string, details?: unknown): ApiError {
  return { error: { code, message, ...(details !== undefined && { details }) } };
}

/** Field-level validation failure, shaped like z.flattenError: { fieldErrors: { field: [msg] } }. */
export function fieldError(field: string, message: string): HttpError {
  return new HttpError(400, 'VALIDATION_ERROR', message, { fieldErrors: { [field]: [message] } });
}
