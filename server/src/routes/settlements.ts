import { Router } from 'express';
import { z } from 'zod';
import {
  CreateSettlementRequestSchema,
  MAX_AMOUNT_PAISE,
  type CreateSettlementRequest,
  type SettlementResponse,
  type UpiLinkResponse,
} from '@split-wise/shared';
import type { Db } from '../db/client.js';
import { HttpError } from '../errors.js';
import { currentUser, requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { createSettlement, deleteSettlement, upiLink } from '../services/settlements.js';
import { idParam } from './params.js';

const UpiQuerySchema = z.object({
  to: z.coerce.number().int().positive(),
  amount_paise: z.coerce.number().int().min(1).max(MAX_AMOUNT_PAISE),
  group_id: z.coerce.number().int().positive().optional(),
});

export function settlementsRouter(db: Db) {
  const router = Router();
  router.use('/settlements', requireAuth);

  /** Must be registered before /settlements/:id. */
  router.get('/settlements/upi-link', (req, res) => {
    const query = UpiQuerySchema.safeParse(req.query);
    if (!query.success) throw new HttpError(400, 'VALIDATION_ERROR', 'Invalid UPI link parameters');
    const { to, amount_paise, group_id } = query.data;
    res.json(
      upiLink(db, currentUser(req).id, {
        toUserId: to,
        amountPaise: amount_paise,
        ...(group_id && { groupId: group_id }),
      }) satisfies UpiLinkResponse,
    );
  });

  router.post('/settlements', validateBody(CreateSettlementRequestSchema), (req, res) => {
    const settlement = createSettlement(
      db,
      currentUser(req).id,
      req.body as CreateSettlementRequest,
    );
    res.status(201).json({ settlement } satisfies SettlementResponse);
  });

  router.delete('/settlements/:id', (req, res) => {
    deleteSettlement(db, currentUser(req).id, idParam(req.params.id, 'Payment'));
    res.status(204).end();
  });

  return router;
}
