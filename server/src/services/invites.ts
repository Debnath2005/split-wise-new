/**
 * Invite links and the link-only merge (ADR-0015).
 * A link is a bearer token for one placeholder: single use, 30 days, stored as a SHA-256 hash.
 */
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, inArray, isNull, or } from 'drizzle-orm';
import {
  ActivityPayloadSchema,
  type ActivityPayload,
  type ExpenseSnapshot,
  type InvitePreviewResponse,
  type InviteResponse,
} from '@split-wise/shared';
import type { Db, DbOrTx } from '../db/client.js';
import {
  activities,
  activityRecipients,
  expenseShares,
  expenses,
  friendships,
  groupMembers,
  groups,
  invites,
  sessions,
  settlements,
  users,
  type UserRow,
} from '../db/schema.js';
import { HttpError, fieldError } from '../errors.js';
import { areFriends, ensureFriendship } from './friends.js';

export const INVITE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const invalidInvite = () => fieldError('invite_token', 'This invite link is no longer valid');

/** Creates a fresh link for a placeholder you're friends with; earlier unused links stop working. */
export function createInvite(
  db: Db,
  actorId: number,
  placeholderId: number,
  now = Date.now(),
): InviteResponse {
  return db.transaction((tx) => {
    const target = tx.select().from(users).where(eq(users.id, placeholderId)).get();
    if (!target || !target.isPlaceholder || !areFriends(tx, actorId, placeholderId)) {
      throw new HttpError(404, 'NOT_FOUND', 'Person not found');
    }
    tx.delete(invites)
      .where(and(eq(invites.placeholderUserId, placeholderId), isNull(invites.usedAt)))
      .run();
    const token = randomBytes(32).toString('base64url');
    const expiresAt = now + INVITE_TTL_MS;
    tx.insert(invites)
      .values({
        placeholderUserId: placeholderId,
        createdByUserId: actorId,
        tokenHash: hashToken(token),
        expiresAt,
      })
      .run();
    return { token, expires_at: expiresAt };
  });
}

interface ValidInvite {
  id: number;
  placeholder: UserRow;
  inviterId: number;
}

/** An unused, unexpired invite whose placeholder is still unclaimed — or null. */
export function findValidInvite(db: DbOrTx, token: string, now = Date.now()): ValidInvite | null {
  const row = db
    .select({ invite: invites, placeholder: users })
    .from(invites)
    .innerJoin(users, eq(users.id, invites.placeholderUserId))
    .where(
      and(
        eq(invites.tokenHash, hashToken(token)),
        isNull(invites.usedAt),
        gt(invites.expiresAt, now),
      ),
    )
    .get();
  if (!row || !row.placeholder.isPlaceholder) return null;
  return { id: row.invite.id, placeholder: row.placeholder, inviterId: row.invite.createdByUserId };
}

/** Public preview: the same `{ valid: false }` for unknown, expired and used links. */
export function previewInvite(db: Db, token: string): InvitePreviewResponse {
  const invite = findValidInvite(db, token);
  if (!invite) return { valid: false };
  const inviter = db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, invite.inviterId))
    .get();
  return {
    valid: true,
    inviter_name: inviter?.name ?? 'A friend',
    invitee_name: invite.placeholder.name,
  };
}

export function markInviteUsed(tx: DbOrTx, inviteId: number): void {
  tx.update(invites).set({ usedAt: Date.now() }).where(eq(invites.id, inviteId)).run();
}

// ── Merge ───────────────────────────────────────────────────────────────────

/**
 * Every (table, column) that references users.id, and so must move in a merge. A test compares
 * this with the real schema: add new user foreign keys here *and* handle them in mergeUsers.
 */
export const MERGED_USER_REFERENCES = [
  'activities.actor_user_id',
  'activity_recipients.user_id',
  'expense_shares.user_id',
  'expenses.created_by_user_id',
  'expenses.deleted_by_user_id',
  'expenses.paid_by_user_id',
  'expenses.updated_by_user_id',
  'friendships.user_high_id',
  'friendships.user_low_id',
  'group_members.user_id',
  'groups.created_by_user_id',
  'invites.created_by_user_id',
  'invites.placeholder_user_id',
  'sessions.user_id',
  'settlements.created_by_user_id',
  'settlements.deleted_by_user_id',
  'settlements.from_user_id',
  'settlements.to_user_id',
  'users.created_by_user_id',
] as const;

/** Rewrites user ids inside a stored activity payload, collapsing shares that now belong to one person. */
function remapPayload(
  item: ActivityPayload,
  from: number,
  into: number,
): ActivityPayload['payload'] {
  const id = (n: number) => (n === from ? into : n);
  const snapshot = (e: ExpenseSnapshot): ExpenseSnapshot => {
    const shares = new Map<number, number>();
    for (const s of e.shares)
      shares.set(id(s.user_id), (shares.get(id(s.user_id)) ?? 0) + s.owed_paise);
    return {
      ...e,
      paid_by_user_id: id(e.paid_by_user_id),
      shares: [...shares]
        .map(([user_id, owed_paise]) => ({ user_id, owed_paise }))
        .sort((a, b) => a.user_id - b.user_id),
    };
  };
  switch (item.type) {
    case 'expense_created':
    case 'expense_restored':
      return { expense: snapshot(item.payload.expense) };
    case 'expense_updated':
      return { before: snapshot(item.payload.before), after: snapshot(item.payload.after) };
    case 'expense_deleted':
      return { before: snapshot(item.payload.before) };
    case 'settlement_created':
      return {
        settlement: {
          ...item.payload.settlement,
          from_user_id: id(item.payload.settlement.from_user_id),
          to_user_id: id(item.payload.settlement.to_user_id),
        },
      };
    case 'settlement_deleted':
      return {
        before: {
          ...item.payload.before,
          from_user_id: id(item.payload.before.from_user_id),
          to_user_id: id(item.payload.before.to_user_id),
        },
      };
    case 'friend_added':
      return { friend: { ...item.payload.friend, id: id(item.payload.friend.id) } };
    case 'member_added':
    case 'member_left':
      return { member: { ...item.payload.member, id: id(item.payload.member.id) } };
    case 'group_created':
      return { ...item.payload, member_ids: [...new Set(item.payload.member_ids.map(id))] };
    default:
      return item.payload;
  }
}

/**
 * Moves everything from placeholder `fromId` onto account `intoId`, then deletes the placeholder
 * (ADR-0015). Must run inside a transaction. Balances are identical before and after.
 */
export function mergeUsers(tx: DbOrTx, fromId: number, intoId: number): void {
  if (fromId === intoId) throw new Error('Cannot merge a user into itself');

  // Friendships: drop the one between them; re-create the rest for the account.
  const friendIds = tx
    .select({ low: friendships.userLowId, high: friendships.userHighId })
    .from(friendships)
    .where(or(eq(friendships.userLowId, fromId), eq(friendships.userHighId, fromId)))
    .all()
    .map((f) => (f.low === fromId ? f.high : f.low));
  tx.delete(friendships)
    .where(or(eq(friendships.userLowId, fromId), eq(friendships.userHighId, fromId)))
    .run();
  for (const other of friendIds) if (other !== intoId) ensureFriendship(tx, intoId, other);

  // Group memberships: one row per group, current if either was current.
  for (const m of tx.select().from(groupMembers).where(eq(groupMembers.userId, fromId)).all()) {
    const mine = tx
      .select()
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, m.groupId), eq(groupMembers.userId, intoId)))
      .get();
    if (mine) {
      if (m.leftAt === null && mine.leftAt !== null) {
        tx.update(groupMembers).set({ leftAt: null }).where(eq(groupMembers.id, mine.id)).run();
      }
      tx.delete(groupMembers).where(eq(groupMembers.id, m.id)).run();
    } else {
      tx.update(groupMembers).set({ userId: intoId }).where(eq(groupMembers.id, m.id)).run();
    }
  }

  // Expense shares: sum when both are in the same expense, so every balance is unchanged.
  for (const s of tx.select().from(expenseShares).where(eq(expenseShares.userId, fromId)).all()) {
    const mine = tx
      .select()
      .from(expenseShares)
      .where(and(eq(expenseShares.expenseId, s.expenseId), eq(expenseShares.userId, intoId)))
      .get();
    if (mine) {
      tx.update(expenseShares)
        .set({
          owedPaise: mine.owedPaise + s.owedPaise,
          inputValue:
            mine.inputValue !== null && s.inputValue !== null
              ? mine.inputValue + s.inputValue
              : null,
        })
        .where(eq(expenseShares.id, mine.id))
        .run();
      tx.delete(expenseShares).where(eq(expenseShares.id, s.id)).run();
    } else {
      tx.update(expenseShares).set({ userId: intoId }).where(eq(expenseShares.id, s.id)).run();
    }
  }
  for (const col of [
    'paidByUserId',
    'createdByUserId',
    'updatedByUserId',
    'deletedByUserId',
  ] as const) {
    tx.update(expenses)
      .set({ [col]: intoId })
      .where(eq(expenses[col], fromId))
      .run();
  }

  // Settlements: one between the two would now be a payment to yourself — remove it.
  const selfPayments = tx
    .select({ id: settlements.id })
    .from(settlements)
    .where(
      or(
        and(eq(settlements.fromUserId, fromId), eq(settlements.toUserId, intoId)),
        and(eq(settlements.fromUserId, intoId), eq(settlements.toUserId, fromId)),
      ),
    )
    .all()
    .map((r) => r.id);
  if (selfPayments.length) {
    tx.update(activities)
      .set({ settlementId: null })
      .where(inArray(activities.settlementId, selfPayments))
      .run();
    tx.delete(settlements).where(inArray(settlements.id, selfPayments)).run();
  }
  for (const col of ['fromUserId', 'toUserId', 'createdByUserId', 'deletedByUserId'] as const) {
    tx.update(settlements)
      .set({ [col]: intoId })
      .where(eq(settlements[col], fromId))
      .run();
  }

  // Activity: payload ids, actors, then recipients (one row per person per item).
  const affected = tx
    .select({ id: activities.id, type: activities.type, payload: activities.payload })
    .from(activities)
    .where(
      or(
        eq(activities.actorUserId, fromId),
        inArray(
          activities.id,
          tx
            .select({ id: activityRecipients.activityId })
            .from(activityRecipients)
            .where(eq(activityRecipients.userId, fromId)),
        ),
      ),
    )
    .all();
  for (const a of affected) {
    const parsed = ActivityPayloadSchema.safeParse({ type: a.type, payload: a.payload });
    if (parsed.success) {
      tx.update(activities)
        .set({ payload: remapPayload(parsed.data, fromId, intoId) })
        .where(eq(activities.id, a.id))
        .run();
    }
  }
  tx.update(activities)
    .set({ actorUserId: intoId })
    .where(eq(activities.actorUserId, fromId))
    .run();
  for (const r of tx
    .select()
    .from(activityRecipients)
    .where(eq(activityRecipients.userId, fromId))
    .all()) {
    const mine = tx
      .select({ id: activityRecipients.id })
      .from(activityRecipients)
      .where(
        and(eq(activityRecipients.activityId, r.activityId), eq(activityRecipients.userId, intoId)),
      )
      .get();
    if (mine) tx.delete(activityRecipients).where(eq(activityRecipients.id, r.id)).run();
    else
      tx.update(activityRecipients)
        .set({ userId: intoId })
        .where(eq(activityRecipients.id, r.id))
        .run();
  }

  // Remaining "created by" references (placeholders rarely create anything, but be complete).
  tx.update(users).set({ createdByUserId: intoId }).where(eq(users.createdByUserId, fromId)).run();
  tx.update(groups)
    .set({ createdByUserId: intoId })
    .where(eq(groups.createdByUserId, fromId))
    .run();
  tx.delete(sessions).where(eq(sessions.userId, fromId)).run();
  tx.update(invites)
    .set({ createdByUserId: intoId })
    .where(eq(invites.createdByUserId, fromId))
    .run();

  // The placeholder's own invites cascade with it; it has no sessions (placeholders can't log in).
  tx.delete(users).where(eq(users.id, fromId)).run();
}

/** Accept a link while logged in: merges the placeholder into this account (ADR-0015). */
export function acceptInvite(db: Db, accountId: number, token: string): void {
  db.transaction((tx) => {
    const invite = findValidInvite(tx, token);
    if (!invite) throw invalidInvite();
    if (invite.inviterId === accountId) {
      throw fieldError(
        'invite_token',
        "This is your own invite — share it with the person you're inviting",
      );
    }
    const account = tx.select().from(users).where(eq(users.id, accountId)).get();
    if (!account || account.isPlaceholder) throw invalidInvite();
    markInviteUsed(tx, invite.id);
    mergeUsers(tx, invite.placeholder.id, accountId);
  });
}
