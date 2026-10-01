import { eq } from 'drizzle-orm';
import type { SignupRequest, UpdateMeRequest, User } from '@split-wise/shared';
import type { Db } from '../db/client.js';
import { users, type UserRow } from '../db/schema.js';
import { HttpError, fieldError } from '../errors.js';
import { hashPassword, verifyPassword } from './passwords.js';

export function toUserDto(row: UserRow): User {
  return { id: row.id, name: row.name, email: row.email, phone: row.phone, upi_vpa: row.upiVpa };
}

const isUniqueViolation = (err: unknown, column: string) =>
  err instanceof Error &&
  'code' in err &&
  err.code === 'SQLITE_CONSTRAINT_UNIQUE' &&
  err.message.includes(`users.${column}`);

const EMAIL_TAKEN = 'An account with this email already exists';

/**
 * Creates an account, or claims a placeholder in place (ADR-0005): the placeholder row matching the
 * email (checked first) or the optional phone becomes this account, so everything already linked to
 * it — friendships, groups, activity — carries over without any merge.
 */
export async function signUp(db: Db, input: SignupRequest): Promise<UserRow> {
  const passwordHash = await hashPassword(input.password);
  const phone = input.phone ?? null;
  try {
    return db.transaction((tx) => {
      const byEmail = tx.select().from(users).where(eq(users.email, input.email)).get();
      if (byEmail && !byEmail.isPlaceholder) throw new HttpError(409, 'CONFLICT', EMAIL_TAKEN);
      const byPhone = phone
        ? tx.select().from(users).where(eq(users.phone, phone)).get()
        : undefined;

      const target = byEmail ?? (byPhone?.isPlaceholder ? byPhone : undefined);
      const phoneHeldElsewhere = byPhone !== undefined && byPhone.id !== target?.id;
      if (phoneHeldElsewhere && !byPhone.isPlaceholder) {
        throw fieldError('phone', 'This phone number is used by another account');
      }
      // A phone held by a *different* placeholder stays there (rows can't be merged), so this
      // account just doesn't get that number.
      const phoneToSet = phoneHeldElsewhere
        ? (target?.phone ?? null)
        : (phone ?? target?.phone ?? null);

      if (target) {
        return tx
          .update(users)
          .set({
            name: input.name,
            email: input.email,
            phone: phoneToSet,
            passwordHash,
            isPlaceholder: false,
            claimedAt: Date.now(),
          })
          .where(eq(users.id, target.id))
          .returning()
          .get()!;
      }
      return tx
        .insert(users)
        .values({ name: input.name, email: input.email, phone: phoneToSet, passwordHash })
        .returning()
        .get();
    });
  } catch (err) {
    if (isUniqueViolation(err, 'email')) throw new HttpError(409, 'CONFLICT', EMAIL_TAKEN);
    if (isUniqueViolation(err, 'phone')) {
      throw fieldError('phone', 'This phone number is used by another account');
    }
    throw err;
  }
}

/** Returns the user only for a real (non-placeholder) account with a matching password. */
export async function authenticate(
  db: Db,
  email: string,
  password: string,
): Promise<UserRow | null> {
  const user = db.select().from(users).where(eq(users.email, email)).get();
  const ok = await verifyPassword(user && !user.isPlaceholder ? user.passwordHash : null, password);
  return ok && user ? user : null;
}

export function updateProfile(db: Db, userId: number, input: UpdateMeRequest): UserRow {
  const changes = {
    ...(input.name !== undefined && { name: input.name }),
    ...(input.phone !== undefined && { phone: input.phone }),
    ...(input.upi_vpa !== undefined && { upiVpa: input.upi_vpa }),
  };
  try {
    const query = db.update(users).set(changes).where(eq(users.id, userId));
    return Object.keys(changes).length
      ? query.returning().get()!
      : db.select().from(users).where(eq(users.id, userId)).get()!;
  } catch (err) {
    if (isUniqueViolation(err, 'phone')) {
      throw fieldError('phone', 'This phone number is used by another account');
    }
    throw err;
  }
}

export async function changePassword(
  db: Db,
  user: UserRow,
  current: string,
  next: string,
): Promise<void> {
  if (!(await verifyPassword(user.passwordHash, current))) {
    throw fieldError('current', 'Current password is incorrect');
  }
  db.update(users)
    .set({ passwordHash: await hashPassword(next) })
    .where(eq(users.id, user.id))
    .run();
}
