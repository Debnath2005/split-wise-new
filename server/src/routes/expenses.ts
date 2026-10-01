import { Router } from 'express';
import {
  CreateExpenseRequestSchema,
  UpdateExpenseRequestSchema,
  type CreateExpenseRequest,
  type ExpenseResponse,
  type UpdateExpenseRequest,
} from '@split-wise/shared';
import type { Db } from '../db/client.js';
import { currentUser, requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import {
  createExpense,
  deleteExpense,
  getExpense,
  restoreExpense,
  updateExpense,
} from '../services/expenses.js';
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

  /** Full replace with optimistic concurrency: 409 when `version` is stale (ADR-0009). */
  router.put('/expenses/:id', validateBody(UpdateExpenseRequestSchema), (req, res) => {
    const expense = updateExpense(
      db,
      currentUser(req).id,
      idParam(req.params.id, 'Expense'),
      req.body as UpdateExpenseRequest,
    );
    res.json({ expense } satisfies ExpenseResponse);
  });

  /** Soft delete (ADR-0010). */
  router.delete('/expenses/:id', (req, res) => {
    deleteExpense(db, currentUser(req).id, idParam(req.params.id, 'Expense'));
    res.status(204).end();
  });

  router.post('/expenses/:id/restore', (req, res) => {
    const expense = restoreExpense(db, currentUser(req).id, idParam(req.params.id, 'Expense'));
    res.json({ expense } satisfies ExpenseResponse);
  });

  return router;
}
