import type { RequestHandler } from 'express';
import { z } from 'zod';
import { HttpError } from '../errors.js';

/** Parses req.body with a shared Zod schema and replaces it with the parsed (normalised) value. */
export function validateBody(schema: z.ZodType): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      const { fieldErrors, formErrors } = z.flattenError(result.error);
      return next(
        new HttpError(400, 'VALIDATION_ERROR', 'Some fields are invalid', {
          fieldErrors,
          formErrors,
        }),
      );
    }
    req.body = result.data;
    next();
  };
}
