import { Router } from 'express';
import { z } from 'zod';
import type { ActivityPage, UnreadCountResponse } from '@split-wise/shared';
import type { Db } from '../db/client.js';
import { HttpError } from '../errors.js';
import { currentUser, requireAuth } from '../middleware/auth.js';
import { listActivity, markAllRead, unreadCount } from '../services/feed.js';

const FeedQuerySchema = z.object({
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(30),
  expense_id: z.coerce.number().int().positive().optional(),
});

export function activityRouter(db: Db) {
  const router = Router();
  router.use('/activity', requireAuth);

  /** Your feed, newest first (SPEC §9). `?expense_id=` gives one expense's history. */
  router.get('/activity', (req, res) => {
    const query = FeedQuerySchema.safeParse(req.query);
    if (!query.success) throw new HttpError(400, 'VALIDATION_ERROR', 'Invalid feed parameters');
    const { before, limit, expense_id } = query.data;
    const page = listActivity(db, currentUser(req).id, {
      limit,
      ...(before && { before }),
      ...(expense_id && { expenseId: expense_id }),
    });
    res.json(page satisfies ActivityPage);
  });

  router.get('/activity/unread-count', (req, res) => {
    res.json({ count: unreadCount(db, currentUser(req).id) } satisfies UnreadCountResponse);
  });

  router.post('/activity/read', (req, res) => {
    markAllRead(db, currentUser(req).id);
    res.status(204).end();
  });

  return router;
}
