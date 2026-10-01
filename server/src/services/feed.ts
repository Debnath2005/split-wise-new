import { and, count, desc, eq, inArray, isNull, lt } from 'drizzle-orm';
import {
  ActivityPayloadSchema,
  type ActivityItem,
  type ActivityPage,
  type ActivityPayload,
  type ExpenseSnapshot,
} from '@split-wise/shared';
import type { Db } from '../db/client.js';
import { activities, activityRecipients, groups, users } from '../db/schema.js';
import { canRestore } from './expenses.js';

// ── Feed (SPEC §9 "Feed UI") ────────────────────────────────────────────────

export interface FeedOptions {
  /** Activity id of the oldest item already shown. */
  before?: number;
  limit: number;
  /** Only this expense's history (expense detail page). */
  expenseId?: number;
}

/** User ids mentioned in a payload, so the client can name them in sentences. */
function mentionedIds(item: ActivityPayload): number[] {
  const fromSnapshot = (s: ExpenseSnapshot) => [
    s.paid_by_user_id,
    ...s.shares.map((x) => x.user_id),
  ];
  switch (item.type) {
    case 'expense_created':
    case 'expense_restored':
      return fromSnapshot(item.payload.expense);
    case 'expense_updated':
      return [...fromSnapshot(item.payload.before), ...fromSnapshot(item.payload.after)];
    case 'expense_deleted':
      return fromSnapshot(item.payload.before);
    case 'friend_added':
      return [item.payload.friend.id];
    case 'member_added':
    case 'member_left':
      return [item.payload.member.id];
    case 'group_created':
      return item.payload.member_ids;
    default:
      return [];
  }
}

/** The viewer's feed, newest first, keyset-paginated by activity id. Only their own recipient rows. */
export function listActivity(
  db: Db,
  userId: number,
  { before, limit, expenseId }: FeedOptions,
): ActivityPage {
  const rows = db
    .select({
      activity: activities,
      readAt: activityRecipients.readAt,
      actor: users,
      groupName: groups.name,
    })
    .from(activityRecipients)
    .innerJoin(activities, eq(activities.id, activityRecipients.activityId))
    .innerJoin(users, eq(users.id, activities.actorUserId))
    .leftJoin(groups, eq(groups.id, activities.groupId))
    .where(
      and(
        eq(activityRecipients.userId, userId),
        before ? lt(activities.id, before) : undefined,
        expenseId ? eq(activities.expenseId, expenseId) : undefined,
      ),
    )
    .orderBy(desc(activities.id))
    .limit(limit + 1)
    .all();

  const page = rows.slice(0, limit);
  const items: ActivityItem[] = [];
  const mentioned = new Set<number>();
  for (const r of page) {
    const parsed = ActivityPayloadSchema.safeParse({
      type: r.activity.type,
      payload: r.activity.payload,
    });
    if (!parsed.success) continue; // never expected: every writer uses these shapes
    for (const id of mentionedIds(parsed.data)) mentioned.add(id);
    mentioned.add(r.actor.id);
    items.push({
      ...parsed.data,
      id: r.activity.id,
      actor: { id: r.actor.id, name: r.actor.name, is_placeholder: r.actor.isPlaceholder },
      group: r.activity.groupId ? { id: r.activity.groupId, name: r.groupName ?? '' } : null,
      expense_id: r.activity.expenseId,
      created_at: r.activity.createdAt,
      read: r.readAt !== null,
      can_restore:
        parsed.data.type === 'expense_deleted' && r.activity.expenseId !== null
          ? canRestore(db, r.activity.expenseId, userId)
          : false,
    });
  }

  const people: Record<string, string> = {};
  if (mentioned.size) {
    for (const u of db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(inArray(users.id, [...mentioned]))
      .all()) {
      people[String(u.id)] = u.name;
    }
  }
  const last = page.at(-1);
  return { items, people, next_cursor: rows.length > limit && last ? last.activity.id : null };
}

export function unreadCount(db: Db, userId: number): number {
  return (
    db
      .select({ n: count() })
      .from(activityRecipients)
      .where(and(eq(activityRecipients.userId, userId), isNull(activityRecipients.readAt)))
      .get()?.n ?? 0
  );
}

/** "Opening the feed marks all as read" (SPEC §9). */
export function markAllRead(db: Db, userId: number): void {
  db.update(activityRecipients)
    .set({ readAt: Date.now() })
    .where(and(eq(activityRecipients.userId, userId), isNull(activityRecipients.readAt)))
    .run();
}
