import { z } from 'zod';
import { EXPENSE_CURSOR_PATTERN } from '@split-wise/shared';
import type { PageOptions } from '../services/expenses.js';
import { HttpError } from '../errors.js';

/** Parses a numeric path id; anything else is a 404 (the resource can't exist). */
export function idParam(value: string | undefined, what: string): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1 || String(id) !== value) {
    throw new HttpError(404, 'NOT_FOUND', `${what} not found`);
  }
  return id;
}

const PageQuerySchema = z.object({
  before: z.string().regex(EXPENSE_CURSOR_PATTERN).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/** `?before=<cursor>&limit=<1..50>` for expense lists. */
export function pageQuery(query: unknown): PageOptions {
  const result = PageQuerySchema.safeParse(query);
  if (!result.success)
    throw new HttpError(400, 'VALIDATION_ERROR', 'Invalid pagination parameters');
  const { before, limit } = result.data;
  return before ? { before, limit } : { limit };
}
