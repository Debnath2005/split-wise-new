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

export async function signUp(db: Db, input: SignupRequest): Promise<UserRow> {
  // Placeholder claiming (ADR-0005) arrives in M2; for now any existing row means the email is taken.
  if (db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).get()) {
    throw new HttpError(409, 'CONFLICT', 'An account with this email already exists');
  }
  const passwordHash = await hashPassword(input.password);
  try {
    return db
      .insert(users)
      .values({ name: input.name, email: input.email, passwordHash })
      .returning()
      .get();
  } catch (err) {
    if (isUniqueViolation(err, 'email')) {
      throw new HttpError(409, 'CONFLICT', 'An account with this email already exists');
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
