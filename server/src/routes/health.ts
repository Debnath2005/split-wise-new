import { Router } from 'express';
import { sql } from 'drizzle-orm';
import type { HealthResponse } from '@split-wise/shared';
import type { Db } from '../db/client.js';

export function healthRouter(db: Db) {
  const router = Router();
  router.get('/health', (_req, res) => {
    let dbOk = true;
    try {
      db.get(sql`select 1`);
    } catch {
      dbOk = false;
    }
    const body: HealthResponse = { status: dbOk ? 'ok' : 'error', db: dbOk ? 'ok' : 'error' };
    res.status(dbOk ? 200 : 503).json(body);
  });
  return router;
}
