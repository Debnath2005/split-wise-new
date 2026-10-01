import { Router } from 'express';
import {
  UpdatePlaceholderRequestSchema,
  type AddFriendResponse,
  type UpdatePlaceholderRequest,
} from '@split-wise/shared';
import type { Db } from '../db/client.js';
import { currentUser, requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { setPlaceholderUpi } from '../services/people.js';
import { idParam } from './params.js';

export function usersRouter(db: Db) {
  const router = Router();
  router.use('/users', requireAuth);

  /** Set a placeholder's UPI ID — only the person who created the placeholder (SPEC §8, §10). */
  router.patch('/users/:id', validateBody(UpdatePlaceholderRequestSchema), (req, res) => {
    const { upi_vpa } = req.body as UpdatePlaceholderRequest;
    const friend = setPlaceholderUpi(
      db,
      currentUser(req).id,
      idParam(req.params.id, 'Person'),
      upi_vpa,
    );
    res.json({ friend } satisfies AddFriendResponse);
  });

  return router;
}
