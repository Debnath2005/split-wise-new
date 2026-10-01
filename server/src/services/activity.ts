import type { DbOrTx } from '../db/client.js';
import { activities, activityRecipients, type ActivityType } from '../db/schema.js';

interface ActivityInput {
  actorUserId: number;
  type: ActivityType;
  groupId?: number | null;
  expenseId?: number | null;
  payload: Record<string, unknown>;
  /** Everyone whose feed shows this item (ADR-0011); duplicates are ignored. */
  recipientIds: number[];
}

/** Call inside the same transaction as the change it describes (ADR-0011). */
export function recordActivity(tx: DbOrTx, input: ActivityInput): number {
  const { id } = tx
    .insert(activities)
    .values({
      actorUserId: input.actorUserId,
      type: input.type,
      groupId: input.groupId ?? null,
      expenseId: input.expenseId ?? null,
      payload: input.payload,
    })
    .returning({ id: activities.id })
    .get();
  const recipients = [...new Set(input.recipientIds)];
  if (recipients.length) {
    tx.insert(activityRecipients)
      .values(recipients.map((userId) => ({ activityId: id, userId })))
      .run();
  }
  return id;
}
