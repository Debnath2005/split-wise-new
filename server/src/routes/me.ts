import { Router } from 'express';
import {
  ChangePasswordRequestSchema,
  UpdateMeRequestSchema,
  type ChangePasswordRequest,
  type MeResponse,
  type UpdateMeRequest,
} from '@split-wise/shared';
import type { Db } from '../db/client.js';
import { currentUser, requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { changePassword, toUserDto, updateProfile } from '../services/users.js';
import { asyncHandler } from './asyncHandler.js';

export function meRouter(db: Db) {
  const router = Router();
  router.use('/me', requireAuth);

  router.patch('/me', validateBody(UpdateMeRequestSchema), (req, res) => {
    const user = updateProfile(db, currentUser(req).id, req.body as UpdateMeRequest);
    res.json({ user: toUserDto(user) } satisfies MeResponse);
  });

  router.post(
    '/me/password',
    validateBody(ChangePasswordRequestSchema),
    asyncHandler(async (req, res) => {
      const { current, next } = req.body as ChangePasswordRequest;
      await changePassword(db, currentUser(req), current, next);
      res.status(204).end();
    }),
  );

  return router;
}
