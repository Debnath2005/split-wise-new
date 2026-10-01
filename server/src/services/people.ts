import { eq } from 'drizzle-orm';
import type { Person, PersonInput } from '@split-wise/shared';
import type { DbOrTx } from '../db/client.js';
import { users, type UserRow } from '../db/schema.js';
import { HttpError, fieldError } from '../errors.js';

export function toPersonDto(row: UserRow): Person {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    is_placeholder: row.isPlaceholder,
  };
}

export function findUserById(db: DbOrTx, id: number): UserRow | undefined {
  return db.select().from(users).where(eq(users.id, id)).get();
}

/**
 * Resolves a person someone wants to add (ADR-0005): reuses the existing user (real or placeholder)
 * with that email or phone, otherwise creates a placeholder owned by the actor.
 * Inputs are already normalised by PersonInputSchema (lowercased email, E.164 phone).
 */
export function findOrCreatePerson(tx: DbOrTx, actorId: number, input: PersonInput): UserRow {
  const byEmail = input.email
    ? tx.select().from(users).where(eq(users.email, input.email)).get()
    : undefined;
  const byPhone = input.phone
    ? tx.select().from(users).where(eq(users.phone, input.phone)).get()
    : undefined;

  if (byEmail && byPhone && byEmail.id !== byPhone.id) {
    throw new HttpError(409, 'CONFLICT', 'That email and phone number belong to different people');
  }
  const existing = byEmail ?? byPhone;
  if (existing) {
    if (existing.id === actorId) throw fieldError(input.email ? 'email' : 'phone', "That's you");
    return existing;
  }

  return tx
    .insert(users)
    .values({
      name: input.name,
      email: input.email ?? null,
      phone: input.phone ?? null,
      isPlaceholder: true,
      createdByUserId: actorId,
    })
    .returning()
    .get();
}

/**
 * Sets the UPI ID of a placeholder (SPEC §8: "a placeholder's VPA can be set by its creator").
 * Anyone else — or a real account, which manages its own — gets 404.
 */
export function setPlaceholderUpi(
  db: DbOrTx,
  actorId: number,
  userId: number,
  upiVpa: string | null,
): Person {
  const user = findUserById(db, userId);
  if (!user || !user.isPlaceholder || user.createdByUserId !== actorId) {
    throw new HttpError(404, 'NOT_FOUND', 'Person not found');
  }
  const updated = db.update(users).set({ upiVpa }).where(eq(users.id, userId)).returning().get()!;
  return toPersonDto(updated);
}
