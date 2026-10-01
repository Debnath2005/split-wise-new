import { HttpError } from '../errors.js';

/** Parses a numeric path id; anything else is a 404 (the resource can't exist). */
export function idParam(value: string | undefined, what: string): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1 || String(id) !== value) {
    throw new HttpError(404, 'NOT_FOUND', `${what} not found`);
  }
  return id;
}
