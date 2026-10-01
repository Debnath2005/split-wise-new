// Drizzle table definitions (SPEC §5). Tables are added milestone by milestone.
import { sql } from 'drizzle-orm';
import { ACTIVITY_TYPES, SPLIT_TYPES } from '@split-wise/shared';
import {
  type AnySQLiteColumn,
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

/** Unix milliseconds. */
const createdAt = () =>
  integer('created_at')
    .notNull()
    .$defaultFn(() => Date.now());

export const users = sqliteTable(
  'users',
  {
    id: integer('id').primaryKey(),
    name: text('name').notNull(),
    /** Stored lowercased. */
    email: text('email').unique(),
    /** E.164. */
    phone: text('phone').unique(),
    /** NULL ⇒ placeholder (ADR-0005). */
    passwordHash: text('password_hash'),
    upiVpa: text('upi_vpa'),
    isPlaceholder: integer('is_placeholder', { mode: 'boolean' }).notNull().default(false),
    createdByUserId: integer('created_by_user_id').references((): AnySQLiteColumn => users.id),
    claimedAt: integer('claimed_at'),
    createdAt: createdAt(),
  },
  (t) => [
    check(
      'users_contact_check',
      sql`${t.email} IS NOT NULL OR ${t.phone} IS NOT NULL OR ${t.isPlaceholder} = 1`,
    ),
  ],
);

export const sessions = sqliteTable(
  'sessions',
  {
    /** SHA-256 (hex) of the cookie value; the raw id is never stored (ADR-0004). */
    id: text('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: integer('expires_at').notNull(),
    lastSeenAt: integer('last_seen_at').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('sessions_user_id_idx').on(t.userId)],
);

export type UserRow = typeof users.$inferSelect;

/** Undirected friendship, stored once with the smaller id first. */
export const friendships = sqliteTable(
  'friendships',
  {
    id: integer('id').primaryKey(),
    userLowId: integer('user_low_id')
      .notNull()
      .references(() => users.id),
    userHighId: integer('user_high_id')
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('friendships_pair_unique').on(t.userLowId, t.userHighId),
    check('friendships_order_check', sql`${t.userLowId} < ${t.userHighId}`),
    index('friendships_user_high_idx').on(t.userHighId),
  ],
);

export const groups = sqliteTable('groups', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  simplifyDebts: integer('simplify_debts', { mode: 'boolean' }).notNull().default(true),
  createdByUserId: integer('created_by_user_id')
    .notNull()
    .references(() => users.id),
  archivedAt: integer('archived_at'),
  createdAt: createdAt(),
});

export const groupMembers = sqliteTable(
  'group_members',
  {
    id: integer('id').primaryKey(),
    groupId: integer('group_id')
      .notNull()
      .references(() => groups.id),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    joinedAt: integer('joined_at')
      .notNull()
      .$defaultFn(() => Date.now()),
    /** Set when a member leaves (M4); current members have NULL. */
    leftAt: integer('left_at'),
  },
  (t) => [
    uniqueIndex('group_members_group_user_unique').on(t.groupId, t.userId),
    index('group_members_user_id_idx').on(t.userId),
  ],
);

export type { ActivityType } from '@split-wise/shared';

/** SPEC §5 / ADR-0011. settlement_id is added with its table (M6). */
export const activities = sqliteTable('activities', {
  id: integer('id').primaryKey(),
  actorUserId: integer('actor_user_id')
    .notNull()
    .references(() => users.id),
  type: text('type', { enum: ACTIVITY_TYPES }).notNull(),
  groupId: integer('group_id').references(() => groups.id),
  expenseId: integer('expense_id').references((): AnySQLiteColumn => expenses.id),
  /** JSON snapshot: {before, after} for updates, {before} for deletes. */
  payload: text('payload', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
  createdAt: createdAt(),
});

export const activityRecipients = sqliteTable(
  'activity_recipients',
  {
    id: integer('id').primaryKey(),
    activityId: integer('activity_id')
      .notNull()
      .references(() => activities.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    readAt: integer('read_at'),
  },
  (t) => [
    uniqueIndex('activity_recipients_activity_user_unique').on(t.activityId, t.userId),
    index('activity_recipients_user_activity_idx').on(t.userId, t.activityId),
  ],
);

export type GroupRow = typeof groups.$inferSelect;

/** SPEC §5. Amounts in integer paise (ADR-0002); exactly one payer (ADR-0007). */
export const expenses = sqliteTable(
  'expenses',
  {
    id: integer('id').primaryKey(),
    /** NULL ⇒ non-group expense between friends. */
    groupId: integer('group_id').references(() => groups.id),
    description: text('description').notNull(),
    amountPaise: integer('amount_paise').notNull(),
    currency: text('currency').notNull().default('INR'),
    paidByUserId: integer('paid_by_user_id')
      .notNull()
      .references(() => users.id),
    splitType: text('split_type', { enum: SPLIT_TYPES }).notNull(),
    /** YYYY-MM-DD */
    expenseDate: text('expense_date').notNull(),
    notes: text('notes'),
    createdByUserId: integer('created_by_user_id')
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    updatedByUserId: integer('updated_by_user_id').references(() => users.id),
    updatedAt: integer('updated_at'),
    deletedAt: integer('deleted_at'),
    deletedByUserId: integer('deleted_by_user_id').references(() => users.id),
    /** Optimistic concurrency for edits (M5, ADR-0009). */
    version: integer('version').notNull().default(1),
  },
  (t) => [
    check('expenses_amount_check', sql`${t.amountPaise} > 0`),
    check('expenses_split_type_check', sql`${t.splitType} IN ('equal', 'exact', 'percent')`),
    index('expenses_group_deleted_idx').on(t.groupId, t.deletedAt),
  ],
);

export const expenseShares = sqliteTable(
  'expense_shares',
  {
    id: integer('id').primaryKey(),
    expenseId: integer('expense_id')
      .notNull()
      .references(() => expenses.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    owedPaise: integer('owed_paise').notNull(),
    /** exact: paise; percent: basis points; equal: NULL (ADR-0008). */
    inputValue: integer('input_value'),
  },
  (t) => [
    check('expense_shares_owed_check', sql`${t.owedPaise} >= 0`),
    uniqueIndex('expense_shares_expense_user_unique').on(t.expenseId, t.userId),
    index('expense_shares_user_id_idx').on(t.userId),
  ],
);

export type ExpenseRow = typeof expenses.$inferSelect;
