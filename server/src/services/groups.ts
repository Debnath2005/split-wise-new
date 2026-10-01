import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import {
  MAX_GROUP_MEMBERS,
  type AddGroupMemberRequest,
  type CreateGroupRequest,
  type GroupDetail,
  type GroupSummary,
} from '@split-wise/shared';
import type { Db, DbOrTx } from '../db/client.js';
import { groupMembers, groups, users, type GroupRow, type UserRow } from '../db/schema.js';
import { HttpError, fieldError } from '../errors.js';
import { recordActivity } from './activity.js';
import { myNetsInGroups, pairwiseInGroup } from './balances.js';
import { areFriends, ensureFriendship } from './friends.js';
import { findOrCreatePerson, findUserById, toPersonDto } from './people.js';
import { memberCountSql } from './sqlFragments.js';

const notFound = () => new HttpError(404, 'NOT_FOUND', 'Group not found');

const isCurrentMember = (groupId: number, userId: number) =>
  and(
    eq(groupMembers.groupId, groupId),
    eq(groupMembers.userId, userId),
    isNull(groupMembers.leftAt),
  );

function currentMembers(db: DbOrTx, groupId: number): UserRow[] {
  return db
    .select({ user: users })
    .from(groupMembers)
    .innerJoin(users, eq(users.id, groupMembers.userId))
    .where(and(eq(groupMembers.groupId, groupId), isNull(groupMembers.leftAt)))
    .orderBy(asc(groupMembers.joinedAt), asc(groupMembers.id))
    .all()
    .map((r) => r.user);
}

/**
 * Loads a group for one of its current members. Non-members get 404, so a group's existence
 * isn't revealed (authorization lives in services — SPEC §10, ADR-0009).
 */
export function requireGroupForMember(db: DbOrTx, groupId: number, userId: number): GroupRow {
  const row = db
    .select({ group: groups })
    .from(groups)
    .innerJoin(groupMembers, isCurrentMember(groupId, userId))
    .where(and(eq(groups.id, groupId), isNull(groups.archivedAt)))
    .get();
  if (!row) throw notFound();
  return row.group;
}

function toGroupDetail(db: DbOrTx, group: GroupRow): GroupDetail {
  return {
    id: group.id,
    name: group.name,
    simplify_debts: group.simplifyDebts,
    created_by_user_id: group.createdByUserId,
    members: currentMembers(db, group.id).map(toPersonDto),
  };
}

/**
 * Adds users to a group and befriends them with every other member (SPEC §5: group members are
 * friends). A former member is re-activated rather than duplicated.
 */
function joinGroup(tx: DbOrTx, groupId: number, newMemberIds: number[]): void {
  const existing = currentMembers(tx, groupId).map((u) => u.id);
  const now = Date.now();
  for (const userId of newMemberIds) {
    tx.insert(groupMembers)
      .values({ groupId, userId, joinedAt: now })
      .onConflictDoUpdate({
        target: [groupMembers.groupId, groupMembers.userId],
        set: { leftAt: null, joinedAt: now },
      })
      .run();
  }
  const everyone = [...new Set([...existing, ...newMemberIds])];
  for (const a of newMemberIds) for (const b of everyone) ensureFriendship(tx, a, b);
}

/** Your groups, each with your net in it (SPEC §10 "my groups with my net in each"). */
export function listGroups(db: Db, userId: number): GroupSummary[] {
  const rows = db
    .select({ id: groups.id, name: groups.name, member_count: memberCountSql })
    .from(groups)
    .innerJoin(
      groupMembers,
      and(eq(groupMembers.groupId, groups.id), eq(groupMembers.userId, userId)),
    )
    .where(and(isNull(groupMembers.leftAt), isNull(groups.archivedAt)))
    .orderBy(desc(groups.createdAt), desc(groups.id))
    .all();
  const nets = myNetsInGroups(
    db,
    userId,
    rows.map((g) => g.id),
  );
  return rows.map((g) => ({ ...g, my_net_paise: nets.get(g.id) ?? 0 }));
}

/**
 * Leave a group (SPEC §10): only when every pairwise balance you have inside it is 0, so no debt
 * is stranded. Logs `member_left` for everyone, including the leaver (ADR-0011).
 */
export function leaveGroup(db: Db, groupId: number, actorId: number): void {
  db.transaction((tx) => {
    requireGroupForMember(tx, groupId, actorId);
    const open = [...pairwiseInGroup(tx, actorId, groupId).values()].some((b) => b !== 0);
    if (open) {
      throw new HttpError(409, 'CONFLICT', 'Settle up with everyone in this group before leaving.');
    }
    const members = currentMembers(tx, groupId);
    const me = members.find((m) => m.id === actorId)!;
    tx.update(groupMembers)
      .set({ leftAt: Date.now() })
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, actorId)))
      .run();
    recordActivity(tx, {
      actorUserId: actorId,
      type: 'member_left',
      groupId,
      payload: { member: { id: me.id, name: me.name } },
      recipientIds: members.map((m) => m.id),
    });
  });
}

export function getGroup(db: Db, groupId: number, userId: number): GroupDetail {
  return toGroupDetail(db, requireGroupForMember(db, groupId, userId));
}

export function createGroup(db: Db, actorId: number, input: CreateGroupRequest): GroupDetail {
  return db.transaction((tx) => {
    for (const id of input.member_ids) {
      if (id !== actorId && !areFriends(tx, actorId, id)) {
        throw fieldError('member_ids', 'You can only add people who are your friends');
      }
    }
    const added = input.new_members.map((p) => findOrCreatePerson(tx, actorId, p).id);
    const memberIds = [...new Set([actorId, ...input.member_ids, ...added])];
    if (memberIds.length > MAX_GROUP_MEMBERS) {
      throw fieldError('member_ids', `A group can have at most ${MAX_GROUP_MEMBERS} members`);
    }

    const group = tx
      .insert(groups)
      .values({ name: input.name, createdByUserId: actorId })
      .returning()
      .get();
    joinGroup(tx, group.id, memberIds);
    recordActivity(tx, {
      actorUserId: actorId,
      type: 'group_created',
      groupId: group.id,
      payload: { group: { id: group.id, name: group.name }, member_ids: memberIds },
      recipientIds: memberIds,
    });
    return toGroupDetail(tx, group);
  });
}

export function renameGroup(db: Db, groupId: number, actorId: number, name: string): GroupDetail {
  return db.transaction((tx) => {
    const group = requireGroupForMember(tx, groupId, actorId);
    if (group.name === name) return toGroupDetail(tx, group);
    const updated = tx.update(groups).set({ name }).where(eq(groups.id, groupId)).returning().get();
    recordActivity(tx, {
      actorUserId: actorId,
      type: 'group_settings_changed',
      groupId,
      payload: { before: { name: group.name }, after: { name } },
      recipientIds: currentMembers(tx, groupId).map((u) => u.id),
    });
    return toGroupDetail(tx, updated!);
  });
}

function resolveNewMember(tx: DbOrTx, actorId: number, input: AddGroupMemberRequest): UserRow {
  if (!('user_id' in input)) return findOrCreatePerson(tx, actorId, input);
  const person = findUserById(tx, input.user_id);
  if (!person || !areFriends(tx, actorId, person.id)) {
    throw fieldError('user_id', 'You can only add people who are your friends');
  }
  return person;
}

export function addGroupMember(
  db: Db,
  groupId: number,
  actorId: number,
  input: AddGroupMemberRequest,
): GroupDetail {
  return db.transaction((tx) => {
    const group = requireGroupForMember(tx, groupId, actorId);

    const person = resolveNewMember(tx, actorId, input);

    const members = currentMembers(tx, groupId);
    if (members.some((m) => m.id === person.id)) {
      throw new HttpError(409, 'CONFLICT', `${person.name} is already in this group`);
    }
    if (members.length >= MAX_GROUP_MEMBERS) {
      throw new HttpError(409, 'CONFLICT', `A group can have at most ${MAX_GROUP_MEMBERS} members`);
    }

    joinGroup(tx, groupId, [person.id]);
    recordActivity(tx, {
      actorUserId: actorId,
      type: 'member_added',
      groupId,
      payload: { member: { id: person.id, name: person.name } },
      recipientIds: [...members.map((m) => m.id), person.id],
    });
    return toGroupDetail(tx, group);
  });
}
