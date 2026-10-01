import { Router, type RequestHandler } from 'express';
import {
  LoginRequestSchema,
  SignupRequestSchema,
  type LoginRequest,
  type MeResponse,
  type SignupRequest,
} from '@split-wise/shared';
import type { Db } from '../db/client.js';
import { HttpError } from '../errors.js';
import {
  clearSessionCookie,
  currentUser,
  requireAuth,
  setSessionCookie,
} from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { createSession, deleteSession } from '../services/sessions.js';
import { authenticate, signUp, toUserDto } from '../services/users.js';
import { asyncHandler } from './asyncHandler.js';

interface AuthRouterOptions {
  db: Db;
  cookieSecure: boolean;
  limiters: { login: RequestHandler; signup: RequestHandler };
}

export function authRouter({ db, cookieSecure, limiters }: AuthRouterOptions) {
  const router = Router();

  router.post(
    '/auth/signup',
    limiters.signup,
    validateBody(SignupRequestSchema),
    asyncHandler(async (req, res) => {
      const user = await signUp(db, req.body as SignupRequest);
      setSessionCookie(res, createSession(db, user.id), cookieSecure);
      res.status(201).json({ user: toUserDto(user) } satisfies MeResponse);
    }),
  );

  router.post(
    '/auth/login',
    limiters.login,
    validateBody(LoginRequestSchema),
    asyncHandler(async (req, res) => {
      const { email, password } = req.body as LoginRequest;
      const user = await authenticate(db, email, password);
      if (!user) throw new HttpError(401, 'UNAUTHENTICATED', 'Email or password is incorrect');
      setSessionCookie(res, createSession(db, user.id), cookieSecure);
      res.json({ user: toUserDto(user) } satisfies MeResponse);
    }),
  );

  router.post('/auth/logout', (req, res) => {
    if (req.sessionToken) deleteSession(db, req.sessionToken);
    clearSessionCookie(res, cookieSecure);
    res.status(204).end();
  });

  router.get('/auth/me', requireAuth, (req, res) => {
    res.json({ user: toUserDto(currentUser(req)) } satisfies MeResponse);
  });

  return router;
}
