import { and, eq, exists, or, sql } from 'drizzle-orm';
import type { DbOrTx } from '../db/client.js';
import { expenseShares, expenses, groups } from '../db/schema.js';

/**
 * Current member count of `groups.id` in the outer query. Uses an explicit alias: Drizzle renders
 * columns unqualified inside raw `sql`, so `groups.id` would otherwise resolve to the inner table.
 */
export const memberCountSql = sql<number>`(SELECT COUNT(*) FROM group_members gm
  WHERE gm.group_id = ${groups}.id AND gm.left_at IS NULL)`;

/** Is `userId` the payer of, or a participant in, the outer `expenses` row? */
export const involves = (db: DbOrTx, userId: number) =>
  or(
    eq(expenses.paidByUserId, userId),
    exists(
      db
        .select({ one: sql`1` })
        .from(expenseShares)
        .where(and(eq(expenseShares.expenseId, expenses.id), eq(expenseShares.userId, userId))),
    ),
  );
