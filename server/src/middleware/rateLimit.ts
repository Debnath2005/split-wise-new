import type { Request } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { errorBody } from '../errors.js';
import { SESSION_COOKIE } from '../services/sessions.js';

export interface RateLimits {
  /** Login and signup attempts per minute (SPEC §12: 5). */
  authPerMinute: number;
  /** All API requests per minute per session, or per IP when logged out (SPEC §12: 120). */
  apiPerMinute: number;
}

export const DEFAULT_RATE_LIMITS: RateLimits = { authPerMinute: 5, apiPerMinute: 120 };

const ip = (req: Request) => ipKeyGenerator(req.ip ?? '');

function limiter(limit: number, keyGenerator: (req: Request) => string) {
  return rateLimit({
    windowMs: 60_000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator,
    handler: (_req, res) => {
      res.status(429).json(errorBody('RATE_LIMITED', 'Too many attempts. Try again in a minute.'));
    },
  });
}

export function createRateLimiters(limits: RateLimits) {
  return {
    api: limiter(limits.apiPerMinute, (req) => {
      const sid: unknown = req.cookies?.[SESSION_COOKIE];
      return typeof sid === 'string' && sid ? `sid:${sid}` : `ip:${ip(req)}`;
    }),
    login: limiter(limits.authPerMinute, (req) => {
      const email: unknown = req.body?.email;
      return `${ip(req)}|${typeof email === 'string' ? email.trim().toLowerCase() : ''}`;
    }),
    signup: limiter(limits.authPerMinute, ip),
  };
}
