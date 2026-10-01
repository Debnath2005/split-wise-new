import { and, asc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import type { FriendDetailResponse, Person, PersonInput } from '@split-wise/shared';
import type { Db, DbOrTx } from '../db/client.js';
import { friendships, groupMembers, groups, users } from '../db/schema.js';
import { HttpError } from '../errors.js';
import { recordActivity } from './activity.js';
import { findOrCreatePerson, toPersonDto } from './people.js';
import { memberCountSql } from './sqlFragments.js';

const pair = (a: number, b: number) =>
  a < b ? { userLowId: a, userHighId: b } : { userLowId: b, userHighId: a };

/** Creates the friendship if missing. Returns true when it was newly created. */
export function ensureFriendship(tx: DbOrTx, a: number, b: number): boolean {
  if (a === b) return false;
  const result = tx.insert(friendships).values(pair(a, b)).onConflictDoNothing().run();
  return result.changes > 0;
}

export function areFriends(db: DbOrTx, a: number, b: number): boolean {
  const { userLowId, userHighId } = pair(a, b);
  return !!db
    .select({ id: friendships.id })
    .from(friendships)
    .where(and(eq(friendships.userLowId, userLowId), eq(friendships.userHighId, userHighId)))
    .get();
}

export function listFriends(db: DbOrTx, userId: number): Person[] {
  const friendId = sql<number>`CASE WHEN ${friendships.userLowId} = ${userId}
    THEN ${friendships.userHighId} ELSE ${friendships.userLowId} END`;
  const rows = db
    .select()
    .from(users)
    .where(
      inArray(
        users.id,
        db
          .select({ id: friendId })
          .from(friendships)
          .where(or(eq(friendships.userLowId, userId), eq(friendships.userHighId, userId))),
      ),
    )
    .orderBy(asc(sql`${users.name} COLLATE NOCASE`), asc(users.id))
    .all();
  return rows.map(toPersonDto);
}

/** Adds a friend by email/phone (creating a placeholder if needed) and logs `friend_added`. */
export function addFriend(
  db: Db,
  actorId: number,
  input: PersonInput,
): { friend: Person; created: boolean } {
  return db.transaction((tx) => {
    const person = findOrCreatePerson(tx, actorId, input);
    const created = ensureFriendship(tx, actorId, person.id);
    if (created) {
      recordActivity(tx, {
        actorUserId: actorId,
        type: 'friend_added',
        payload: { friend: { id: person.id, name: person.name } },
        recipientIds: [actorId, person.id],
      });
    }
    return { friend: toPersonDto(person), created };
  });
}

export function getFriendDetail(db: Db, actorId: number, friendId: number): FriendDetailResponse {
  if (!areFriends(db, actorId, friendId)) throw new HttpError(404, 'NOT_FOUND', 'Friend not found');
  const friend = db.select().from(users).where(eq(users.id, friendId)).get();
  if (!friend) throw new HttpError(404, 'NOT_FOUND', 'Friend not found');

  const memberOf = (uid: number) =>
    db
      .select({ groupId: groupMembers.groupId })
      .from(groupMembers)
      .where(and(eq(groupMembers.userId, uid), isNull(groupMembers.leftAt)));

  const shared = db
    .select({ id: groups.id, name: groups.name, member_count: memberCountSql })
    .from(groups)
    .where(
      and(
        isNull(groups.archivedAt),
        inArray(groups.id, memberOf(actorId)),
        inArray(groups.id, memberOf(friendId)),
      ),
    )
    .orderBy(asc(sql`${groups.name} COLLATE NOCASE`))
    .all();

  return { friend: toPersonDto(friend), shared_groups: shared };
}
