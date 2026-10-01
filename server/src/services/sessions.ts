import { createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { sessions, users, type UserRow } from '../db/schema.js';

export const SESSION_COOKIE = 'sid';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Sliding expiry is refreshed at most this often, to avoid a write on every request. */
const TOUCH_INTERVAL_MS = 60 * 60 * 1000;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** Creates a session and returns the raw token for the cookie. Only its SHA-256 is stored. */
export function createSession(db: Db, userId: number, now = Date.now()): string {
  const token = randomBytes(32).toString('base64url');
  db.insert(sessions)
    .values({ id: hashToken(token), userId, expiresAt: now + SESSION_TTL_MS, lastSeenAt: now })
    .run();
  return token;
}

export interface ResolvedSession {
  user: UserRow;
  /** True when the expiry was extended, so the cookie should be re-sent with a fresh max-age. */
  refreshed: boolean;
}

export function resolveSession(db: Db, token: string, now = Date.now()): ResolvedSession | null {
  const id = hashToken(token);
  const row = db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, id))
    .get();
  if (!row) return null;
  if (row.session.expiresAt <= now) {
    db.delete(sessions).where(eq(sessions.id, id)).run();
    return null;
  }
  const refreshed = now - row.session.lastSeenAt >= TOUCH_INTERVAL_MS;
  if (refreshed) {
    db.update(sessions)
      .set({ lastSeenAt: now, expiresAt: now + SESSION_TTL_MS })
      .where(eq(sessions.id, id))
      .run();
  }
  return { user: row.user, refreshed };
}

export function deleteSession(db: Db, token: string): void {
  db.delete(sessions)
    .where(eq(sessions.id, hashToken(token)))
    .run();
}
