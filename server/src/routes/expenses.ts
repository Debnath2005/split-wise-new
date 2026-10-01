import { Router } from 'express';
import {
  CreateExpenseRequestSchema,
  type CreateExpenseRequest,
  type ExpenseResponse,
} from '@split-wise/shared';
import type { Db } from '../db/client.js';
import { currentUser, requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { createExpense, getExpense } from '../services/expenses.js';
import { idParam } from './params.js';

export function expensesRouter(db: Db) {
  const router = Router();
  router.use('/expenses', requireAuth);

  router.post('/expenses', validateBody(CreateExpenseRequestSchema), (req, res) => {
    const expense = createExpense(db, currentUser(req).id, req.body as CreateExpenseRequest);
    res.status(201).json({ expense } satisfies ExpenseResponse);
  });

  router.get('/expenses/:id', (req, res) => {
    const expense = getExpense(db, idParam(req.params.id, 'Expense'), currentUser(req).id);
    res.json({ expense } satisfies ExpenseResponse);
  });

  return router;
}
