import { Router } from 'express';
import type { BalanceSummaryResponse } from '@split-wise/shared';
import type { Db } from '../db/client.js';
import { currentUser, requireAuth } from '../middleware/auth.js';
import { balanceSummary } from '../services/balances.js';

export function balancesRouter(db: Db) {
  const router = Router();
  router.use('/balances', requireAuth);

  /** Dashboard totals: what you owe and are owed across everyone (SPEC §6). */
  router.get('/balances/summary', (req, res) => {
    res.json(balanceSummary(db, currentUser(req).id) satisfies BalanceSummaryResponse);
  });

  return router;
}
