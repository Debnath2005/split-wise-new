/**
 * Settlements (SPEC §5, §8, ADR-0013): self-reported "from paid to ₹X". They count toward
 * balances (SPEC §6), can be deleted (ADR-0010), and every write logs activity (ADR-0011).
 */
import { and, eq, isNull } from 'drizzle-orm';
import {
  buildUpiUri,
  upiNote,
  type CreateSettlementRequest,
  type SettlementListItem,
  type SettlementSnapshot,
  type UpiLinkResponse,
} from '@split-wise/shared';
import type { Db, DbOrTx } from '../db/client.js';
import { groupMembers, groups, settlements, users, type SettlementRow } from '../db/schema.js';
import { HttpError, fieldError } from '../errors.js';
import { recordActivity } from './activity.js';
import { areFriends } from './friends.js';
import { requireGroupForMember } from './groups.js';

const notFound = () => new HttpError(404, 'NOT_FOUND', 'Payment not found');

function currentMemberIds(db: DbOrTx, groupId: number): Set<number> {
  return new Set(
    db
      .select({ id: groupMembers.userId })
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), isNull(groupMembers.leftAt)))
      .all()
      .map((r) => r.id),
  );
}

const snapshot = (s: SettlementRow): SettlementSnapshot => ({
  id: s.id,
  from_user_id: s.fromUserId,
  to_user_id: s.toUserId,
  amount_paise: s.amountPaise,
  method: s.method,
  settled_on: s.settledOn,
  note: s.note,
});

function toListItem(db: DbOrTx, s: SettlementRow): SettlementListItem {
  const ref = (id: number) => {
    const u = db.select().from(users).where(eq(users.id, id)).get()!;
    return { id: u.id, name: u.name, is_placeholder: u.isPlaceholder };
  };
  const group = s.groupId
    ? db
        .select({ id: groups.id, name: groups.name })
        .from(groups)
        .where(eq(groups.id, s.groupId))
        .get()!
    : null;
  return {
    kind: 'settlement',
    id: s.id,
    group,
    from: ref(s.fromUserId),
    to: ref(s.toUserId),
    amount_paise: s.amountPaise,
    method: s.method,
    note: s.note,
    settled_on: s.settledOn,
  };
}

/** Feed recipients: everyone in the group, or just the two people (SPEC §9). */
function recipients(db: DbOrTx, s: SettlementRow): number[] {
  const ids = new Set([s.fromUserId, s.toUserId]);
  if (s.groupId) for (const id of currentMemberIds(db, s.groupId)) ids.add(id);
  return [...ids];
}

/**
 * Who may record (SPEC §10): in a group, any current member may record a payment between two
 * current members; outside groups you must be one of the two, and the other must be your friend.
 */
function checkParties(tx: DbOrTx, actorId: number, input: CreateSettlementRequest): void {
  if (input.group_id) {
    requireGroupForMember(tx, input.group_id, actorId);
    const members = currentMemberIds(tx, input.group_id);
    if (!members.has(input.from_user_id) || !members.has(input.to_user_id)) {
      throw fieldError('to_user_id', 'Both people must be members of this group');
    }
    return;
  }
  const other =
    input.from_user_id === actorId
      ? input.to_user_id
      : input.to_user_id === actorId
        ? input.from_user_id
        : null;
  if (other === null)
    throw fieldError('from_user_id', 'You must be the payer or the person being paid');
  if (!areFriends(tx, actorId, other))
    throw fieldError('to_user_id', 'You can only settle up with your friends');
}

export function createSettlement(
  db: Db,
  actorId: number,
  input: CreateSettlementRequest,
): SettlementListItem {
  return db.transaction((tx) => {
    checkParties(tx, actorId, input);
    const row = tx
      .insert(settlements)
      .values({
        groupId: input.group_id ?? null,
        fromUserId: input.from_user_id,
        toUserId: input.to_user_id,
        amountPaise: input.amount_paise,
        method: input.method,
        note: input.note ?? null,
        settledOn: input.settled_on,
        createdByUserId: actorId,
      })
      .returning()
      .get();
    recordActivity(tx, {
      actorUserId: actorId,
      type: 'settlement_created',
      groupId: row.groupId,
      settlementId: row.id,
      payload: { settlement: snapshot(row) },
      recipientIds: recipients(tx, row),
    });
    return toListItem(tx, row);
  });
}

/** Delete (SPEC §9): `from`, `to`, or — for a group settlement — any current member. */
export function deleteSettlement(db: Db, actorId: number, settlementId: number): void {
  db.transaction((tx) => {
    const row = tx
      .select()
      .from(settlements)
      .where(and(eq(settlements.id, settlementId), isNull(settlements.deletedAt)))
      .get();
    if (!row) throw notFound();
    const party = row.fromUserId === actorId || row.toUserId === actorId;
    const member = row.groupId !== null && currentMemberIds(tx, row.groupId).has(actorId);
    if (!party && !member) throw notFound();

    tx.update(settlements)
      .set({ deletedAt: Date.now(), deletedByUserId: actorId })
      .where(eq(settlements.id, settlementId))
      .run();
    recordActivity(tx, {
      actorUserId: actorId,
      type: 'settlement_deleted',
      groupId: row.groupId,
      settlementId: row.id,
      payload: { before: snapshot(row) },
      recipientIds: recipients(tx, row),
    });
  });
}

/**
 * `upi://pay` link to pay `toUserId` (SPEC §8): 422 NO_VPA when they haven't set a UPI ID. Only
 * for someone you share a group or friendship with, so it can't be used to look up strangers.
 */
export function upiLink(
  db: Db,
  actorId: number,
  { toUserId, amountPaise, groupId }: { toUserId: number; amountPaise: number; groupId?: number },
): UpiLinkResponse {
  let groupName: string | null = null;
  if (groupId) {
    groupName = requireGroupForMember(db, groupId, actorId).name;
    if (!currentMemberIds(db, groupId).has(toUserId))
      throw new HttpError(404, 'NOT_FOUND', 'Person not found');
  } else if (!areFriends(db, actorId, toUserId)) {
    throw new HttpError(404, 'NOT_FOUND', 'Person not found');
  }
  const payee = db.select().from(users).where(eq(users.id, toUserId)).get();
  if (!payee) throw new HttpError(404, 'NOT_FOUND', 'Person not found');
  if (!payee.upiVpa) throw new HttpError(422, 'NO_VPA', `${payee.name} hasn't added a UPI ID yet`);
  return {
    uri: buildUpiUri({
      vpa: payee.upiVpa,
      payeeName: payee.name,
      amountPaise,
      note: upiNote(groupName),
    }),
    vpa: payee.upiVpa,
    payee_name: payee.name,
  };
}
