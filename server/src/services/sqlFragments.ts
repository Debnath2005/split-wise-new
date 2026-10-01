import { sql } from 'drizzle-orm';
import { groups } from '../db/schema.js';

/**
 * Current member count of `groups.id` in the outer query. Uses an explicit alias: Drizzle renders
 * columns unqualified inside raw `sql`, so `groups.id` would otherwise resolve to the inner table.
 */
export const memberCountSql = sql<number>`(SELECT COUNT(*) FROM group_members gm
  WHERE gm.group_id = ${groups}.id AND gm.left_at IS NULL)`;
