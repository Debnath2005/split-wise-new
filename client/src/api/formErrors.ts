import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiRequestError } from './client';

/**
 * Copies server field errors onto the form. Returns a message for a form-level alert
 * when the error isn't tied to a known field (e.g. 401, 409, 429, network).
 */
export function applyServerErrors<T extends FieldValues>(
  err: unknown,
  setError: UseFormSetError<T>,
  fields: readonly Path<T>[],
): string | null {
  if (!(err instanceof ApiRequestError)) return 'Something went wrong. Please try again.';
  let matched = false;
  for (const field of fields) {
    const message = err.fieldErrors[field]?.[0];
    if (message) {
      setError(field, { type: 'server', message });
      matched = true;
    }
  }
  return matched ? null : err.message;
}
