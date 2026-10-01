import type { CookieOptions, RequestHandler, Response } from 'express';
import type { Db } from '../db/client.js';
import type { UserRow } from '../db/schema.js';
import { HttpError } from '../errors.js';
import { SESSION_COOKIE, SESSION_TTL_MS, resolveSession } from '../services/sessions.js';

declare module 'express-serve-static-core' {
  interface Request {
    user?: UserRow;
    sessionToken?: string;
  }
}

export function sessionCookieOptions(secure: boolean): CookieOptions {
  return { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: SESSION_TTL_MS };
}

export function setSessionCookie(res: Response, token: string, secure: boolean) {
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions(secure));
}

export function clearSessionCookie(res: Response, secure: boolean) {
  const { maxAge: _maxAge, ...options } = sessionCookieOptions(secure);
  res.clearCookie(SESSION_COOKIE, options);
}

/** Attaches req.user when the session cookie is valid; never rejects on its own. */
export function loadSession(db: Db, cookieSecure: boolean): RequestHandler {
  return (req, res, next) => {
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    if (typeof token === 'string' && token) {
      const session = resolveSession(db, token);
      if (session) {
        req.user = session.user;
        req.sessionToken = token;
        if (session.refreshed) setSessionCookie(res, token, cookieSecure);
      }
    }
    next();
  };
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  next(req.user ? undefined : new HttpError(401, 'UNAUTHENTICATED', 'Please log in'));
};

/** Narrowing helper for handlers mounted after requireAuth. */
export function currentUser(req: { user?: UserRow }): UserRow {
  if (!req.user) throw new HttpError(401, 'UNAUTHENTICATED', 'Please log in');
  return req.user;
}
