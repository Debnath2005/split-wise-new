import type { RequestHandler } from 'express';
import { HttpError } from '../errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** SPEC §12: mutating requests must carry `X-Requested-With: fetch` (on top of SameSite=Lax). */
export const requireFetchHeader: RequestHandler = (req, _res, next) => {
  if (SAFE_METHODS.has(req.method) || req.get('X-Requested-With') === 'fetch') return next();
  next(new HttpError(403, 'FORBIDDEN', 'Missing X-Requested-With header'));
};
