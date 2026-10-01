// Drizzle table definitions (SPEC §5). Tables are added milestone by milestone.
import { sql } from 'drizzle-orm';
import {
  type AnySQLiteColumn,
  check,
  index,
  integer,
  sqliteTable,
  text,
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
