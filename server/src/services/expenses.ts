import { and, desc, eq, inArray, isNull, lt, or, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import {
  computeSplit,
  formatPaise,
  type CreateExpenseRequest,
  type ExpenseSnapshot,
  type UpdateExpenseRequest,
  type ExpenseDetail,
  type ExpenseListItem,
  type ExpensePage,
  type PersonRef,
} from '@split-wise/shared';
import type { Db, DbOrTx } from '../db/client.js';
import {
  expenseShares,
  expenses,
  groupMembers,
  groups,
  users,
  type ExpenseRow,
  type UserRow,
} from '../db/schema.js';
import { HttpError, fieldError } from '../errors.js';
import { recordActivity } from './activity.js';
import { areFriends } from './friends.js';
import { requireGroupForMember } from './groups.js';
import { involves } from './sqlFragments.js';

const notFound = () => new HttpError(404, 'NOT_FOUND', 'Expense not found');

const toRef = (u: Pick<UserRow, 'id' | 'name' | 'isPlaceholder'>): PersonRef => ({
  id: u.id,
  name: u.name,
  is_placeholder: u.isPlaceholder,
});

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

type PeopleInput = Pick<CreateExpenseRequest, 'group_id' | 'paid_by_user_id' | 'participants'>;

/**
 * Who may be in an expense (SPEC §10 authorization rule):
 * group — the actor (else 404), payer and participants must be current members;
 * non-group — the actor must be the payer or a participant, and everyone else their friend.
 * When editing, people already on the expense may stay even if they aren't the editor's friend.
 */
function checkPeople(
  tx: DbOrTx,
  actorId: number,
  input: PeopleInput,
  alreadyOnExpense: ReadonlySet<number> = new Set(),
): void {
  const participantIds = input.participants.map((p) => p.user_id);
  if (input.group_id) {
    requireGroupForMember(tx, input.group_id, actorId);
    const members = currentMemberIds(tx, input.group_id);
    if (!members.has(input.paid_by_user_id)) {
      throw fieldError('paid_by_user_id', 'The payer must be a member of this group');
    }
    if (participantIds.some((id) => !members.has(id))) {
      throw fieldError('participants', 'Everyone in the split must be a member of this group');
    }
    return;
  }
  const involved = new Set([input.paid_by_user_id, ...participantIds]);
  if (!involved.has(actorId)) {
    throw fieldError('participants', 'You must be the payer or one of the people in the split');
  }
  for (const id of involved) {
    if (id !== actorId && !alreadyOnExpense.has(id) && !areFriends(tx, actorId, id)) {
      throw fieldError('participants', 'You can only split with your friends');
    }
  }
}

type SplitInputFields = Pick<CreateExpenseRequest, 'amount_paise' | 'split_type' | 'participants'>;

/** Server-authoritative shares (ADR-0008): the client sends only the split input. */
function computeShares(input: SplitInputFields) {
  const result = computeSplit({
    amountPaise: input.amount_paise,
    splitType: input.split_type,
    participants: input.participants.map((p) => ({ userId: p.user_id, value: p.value })),
  });
  if (!result.ok) {
    const { error } = result;
    if (error.code === 'SPLIT_SUM_MISMATCH') {
      const message =
        input.split_type === 'percent'
          ? 'Percentages must add up to 100%'
          : `Shares must add up to ${formatPaise(input.amount_paise)}`;
      throw new HttpError(400, 'SPLIT_SUM_MISMATCH', message, {
        expected: error.expected,
        actual: error.actual,
        remaining: error.remaining,
      });
    }
    throw fieldError('participants', error.message);
  }
  // SPEC §4 rule 4: shares always sum to the amount. computeSplit guarantees it; check anyway.
  const total = result.shares.reduce((sum, s) => sum + s.owedPaise, 0);
  if (total !== input.amount_paise) {
    throw new Error(`Split invariant violated: ${total} !== ${input.amount_paise}`);
  }
  return result.shares;
}

const peopleIn = (snap: ExpenseSnapshot) => [
  snap.paid_by_user_id,
  ...snap.shares.map((s) => s.user_id),
];

/**
 * Feed recipients (SPEC §9): everyone in the given snapshots (for updates, before ∪ after, so
 * someone removed still sees it), plus all current members for a group expense.
 */
function recipientsFor(
  tx: DbOrTx,
  groupId: number | null,
  ...snapshots: ExpenseSnapshot[]
): number[] {
  const ids = new Set(snapshots.flatMap(peopleIn));
  if (groupId) for (const id of currentMemberIds(tx, groupId)) ids.add(id);
  return [...ids];
}

/** The expense as an activity snapshot (ExpenseSnapshotSchema), read from the database. */
function snapshot(db: DbOrTx, expense: ExpenseRow): ExpenseSnapshot {
  const shares = db
    .select({ user_id: expenseShares.userId, owed_paise: expenseShares.owedPaise })
    .from(expenseShares)
    .where(eq(expenseShares.expenseId, expense.id))
    .orderBy(expenseShares.userId)
    .all();
  return {
    id: expense.id,
    description: expense.description,
    amount_paise: expense.amountPaise,
    paid_by_user_id: expense.paidByUserId,
    split_type: expense.splitType,
    expense_date: expense.expenseDate,
    shares,
  };
}

function insertShares(tx: DbOrTx, expenseId: number, shares: ReturnType<typeof computeShares>) {
  tx.insert(expenseShares)
    .values(
      shares.map((s) => ({
        expenseId,
        userId: s.userId,
        owedPaise: s.owedPaise,
        inputValue: s.inputValue,
      })),
    )
    .run();
}

export function createExpense(db: Db, actorId: number, input: CreateExpenseRequest): ExpenseDetail {
  return db.transaction((tx) => {
    checkPeople(tx, actorId, input);
    const shares = computeShares(input);

    const expense = tx
      .insert(expenses)
      .values({
        groupId: input.group_id ?? null,
        description: input.description,
        amountPaise: input.amount_paise,
        paidByUserId: input.paid_by_user_id,
        splitType: input.split_type,
        expenseDate: input.expense_date,
        notes: input.notes ?? null,
        createdByUserId: actorId,
      })
      .returning()
      .get();
    insertShares(tx, expense.id, shares);

    const snap = snapshot(tx, expense);
    recordActivity(tx, {
      actorUserId: actorId,
      type: 'expense_created',
      groupId: expense.groupId,
      expenseId: expense.id,
      payload: { expense: snap },
      recipientIds: recipientsFor(tx, expense.groupId, snap),
    });

    return toExpenseDetail(tx, expense);
  });
}

// ── Edit, delete, restore (SPEC §9, ADR-0009, ADR-0010) ─────────────────────

function findExpense(db: DbOrTx, id: number): ExpenseRow | undefined {
  return db.select().from(expenses).where(eq(expenses.id, id)).get();
}

/** A live (non-deleted) expense the actor may see and change; otherwise 404 (D3 / SPEC §9). */
function requireEditable(db: DbOrTx, id: number, actorId: number): ExpenseRow {
  const expense = findExpense(db, id);
  if (!expense || expense.deletedAt !== null || !canView(db, expense, actorId)) throw notFound();
  return expense;
}

export function updateExpense(
  db: Db,
  actorId: number,
  expenseId: number,
  input: UpdateExpenseRequest,
): ExpenseDetail {
  return db.transaction((tx) => {
    const current = requireEditable(tx, expenseId, actorId);
    if (current.version !== input.version) throw versionConflict(tx, current);

    const before = snapshot(tx, current);
    const fields = { ...input, group_id: current.groupId };
    checkPeople(tx, actorId, fields, new Set(peopleIn(before)));
    const shares = computeShares(fields);

    // Optimistic concurrency (ADR-0009): only applies if nobody saved in between.
    const updated = tx
      .update(expenses)
      .set({
        description: input.description,
        amountPaise: input.amount_paise,
        paidByUserId: input.paid_by_user_id,
        splitType: input.split_type,
        expenseDate: input.expense_date,
        notes: input.notes ?? null,
        updatedByUserId: actorId,
        updatedAt: Date.now(),
        version: current.version + 1,
      })
      .where(and(eq(expenses.id, expenseId), eq(expenses.version, input.version)))
      .returning()
      .get();
    if (!updated) throw versionConflict(tx, findExpense(tx, expenseId)!);

    tx.delete(expenseShares).where(eq(expenseShares.expenseId, expenseId)).run();
    insertShares(tx, expenseId, shares);
    const after = snapshot(tx, updated);

    recordActivity(tx, {
      actorUserId: actorId,
      type: 'expense_updated',
      groupId: updated.groupId,
      expenseId,
      payload: { before, after },
      recipientIds: recipientsFor(tx, updated.groupId, before, after),
    });
    return toExpenseDetail(tx, updated);
  });
}

function versionConflict(db: DbOrTx, latest: ExpenseRow): HttpError {
  const by = latest.updatedByUserId ?? latest.createdByUserId;
  const name =
    db.select({ name: users.name }).from(users).where(eq(users.id, by)).get()?.name ?? 'someone';
  return new HttpError(
    409,
    'CONFLICT',
    `This expense was changed by ${name}. Review it and try again.`,
    {
      version: latest.version,
    },
  );
}

export function deleteExpense(db: Db, actorId: number, expenseId: number): void {
  db.transaction((tx) => {
    const current = requireEditable(tx, expenseId, actorId);
    const before = snapshot(tx, current);
    tx.update(expenses)
      .set({ deletedAt: Date.now(), deletedByUserId: actorId, version: current.version + 1 })
      .where(eq(expenses.id, expenseId))
      .run();
    recordActivity(tx, {
      actorUserId: actorId,
      type: 'expense_deleted',
      groupId: current.groupId,
      expenseId,
      payload: { before },
      recipientIds: recipientsFor(tx, current.groupId, before),
    });
  });
}

/**
 * Why an expense can't be restored by this person, or null if it can (SPEC §9): it must be
 * deleted, visible to them, and — for a group — everyone in it must still be a member.
 */
function restoreBlocker(db: DbOrTx, expense: ExpenseRow, actorId: number): HttpError | null {
  if (!canView(db, expense, actorId)) return notFound();
  if (expense.deletedAt === null)
    return new HttpError(409, 'CONFLICT', "This expense isn't deleted");
  if (expense.groupId) {
    const members = currentMemberIds(db, expense.groupId);
    const gone = peopleIn(snapshot(db, expense)).find((id) => !members.has(id));
    if (gone !== undefined) {
      const who = db.select({ name: users.name }).from(users).where(eq(users.id, gone)).get()?.name;
      return new HttpError(
        409,
        'CONFLICT',
        `${who ?? 'Someone'} has left this group, so this expense can't be restored.`,
      );
    }
  }
  return null;
}

/** Used by the feed to decide whether to offer Restore. */
export function canRestore(db: DbOrTx, expenseId: number, actorId: number): boolean {
  const expense = findExpense(db, expenseId);
  return !!expense && restoreBlocker(db, expense, actorId) === null;
}

export function restoreExpense(db: Db, actorId: number, expenseId: number): ExpenseDetail {
  return db.transaction((tx) => {
    const expense = findExpense(tx, expenseId);
    if (!expense) throw notFound();
    const blocker = restoreBlocker(tx, expense, actorId);
    if (blocker) throw blocker;

    const restored = tx
      .update(expenses)
      .set({ deletedAt: null, deletedByUserId: null, version: expense.version + 1 })
      .where(eq(expenses.id, expenseId))
      .returning()
      .get()!;
    const snap = snapshot(tx, restored);
    recordActivity(tx, {
      actorUserId: actorId,
      type: 'expense_restored',
      groupId: restored.groupId,
      expenseId,
      payload: { expense: snap },
      recipientIds: recipientsFor(tx, restored.groupId, snap),
    });
    return toExpenseDetail(tx, restored);
  });
}

function toExpenseDetail(db: DbOrTx, expense: ExpenseRow): ExpenseDetail {
  const shareRows = db
    .select({ share: expenseShares, user: users })
    .from(expenseShares)
    .innerJoin(users, eq(users.id, expenseShares.userId))
    .where(eq(expenseShares.expenseId, expense.id))
    .orderBy(expenseShares.userId)
    .all();
  const person = (id: number) => db.select().from(users).where(eq(users.id, id)).get()!;
  const group = expense.groupId
    ? db
        .select({ id: groups.id, name: groups.name })
        .from(groups)
        .where(eq(groups.id, expense.groupId))
        .get()!
    : null;

  return {
    id: expense.id,
    group,
    description: expense.description,
    amount_paise: expense.amountPaise,
    currency: 'INR',
    split_type: expense.splitType,
    expense_date: expense.expenseDate,
    notes: expense.notes,
    paid_by: toRef(person(expense.paidByUserId)),
    created_by: toRef(person(expense.createdByUserId)),
    created_at: expense.createdAt,
    version: expense.version,
    shares: shareRows.map((r) => ({
      user: toRef(r.user),
      owed_paise: r.share.owedPaise,
      input_value: r.share.inputValue,
    })),
  };
}

function canView(db: DbOrTx, expense: ExpenseRow, userId: number): boolean {
  if (expense.groupId) return currentMemberIds(db, expense.groupId).has(userId);
  if (expense.paidByUserId === userId) return true;
  return !!db
    .select({ id: expenseShares.id })
    .from(expenseShares)
    .where(and(eq(expenseShares.expenseId, expense.id), eq(expenseShares.userId, userId)))
    .get();
}

export function getExpense(db: Db, expenseId: number, actorId: number): ExpenseDetail {
  const expense = db
    .select()
    .from(expenses)
    .where(and(eq(expenses.id, expenseId), isNull(expenses.deletedAt)))
    .get();
  if (!expense || !canView(db, expense, actorId)) throw notFound();
  return toExpenseDetail(db, expense);
}

// ── Lists ──────────────────────────────────────────────────────────────────

export interface PageOptions {
  /** "<expense_date>.<id>" of the last item already shown. */
  before?: string;
  limit: number;
}

const payer = alias(users, 'payer');
const myShare = alias(expenseShares, 'my_share');

/** Newest first by expense date, then id; keyset-paginated. Deleted expenses are excluded. */
function listExpenses(
  db: DbOrTx,
  viewerId: number,
  where: SQL,
  { before, limit }: PageOptions,
): ExpensePage {
  const conditions = [isNull(expenses.deletedAt), where];
  if (before) {
    const [date, rawId] = before.split('.') as [string, string];
    const id = Number(rawId);
    conditions.push(
      or(lt(expenses.expenseDate, date), and(eq(expenses.expenseDate, date), lt(expenses.id, id)))!,
    );
  }

  const rows = db
    .select({ expense: expenses, payer, groupName: groups.name, myOwed: myShare.owedPaise })
    .from(expenses)
    .innerJoin(payer, eq(payer.id, expenses.paidByUserId))
    .leftJoin(groups, eq(groups.id, expenses.groupId))
    .leftJoin(myShare, and(eq(myShare.expenseId, expenses.id), eq(myShare.userId, viewerId)))
    .where(and(...conditions))
    .orderBy(desc(expenses.expenseDate), desc(expenses.id))
    .limit(limit + 1)
    .all();

  const page = rows.slice(0, limit);
  const items: ExpenseListItem[] = page.map((r) => ({
    id: r.expense.id,
    group: r.expense.groupId ? { id: r.expense.groupId, name: r.groupName ?? '' } : null,
    description: r.expense.description,
    amount_paise: r.expense.amountPaise,
    expense_date: r.expense.expenseDate,
    split_type: r.expense.splitType,
    paid_by: toRef(r.payer),
    my_share_paise: r.myOwed ?? 0,
  }));
  const last = page.at(-1);
  return {
    expenses: items,
    next_cursor:
      rows.length > limit && last ? `${last.expense.expenseDate}.${last.expense.id}` : null,
  };
}

export function listGroupExpenses(
  db: Db,
  groupId: number,
  actorId: number,
  options: PageOptions,
): ExpensePage {
  requireGroupForMember(db, groupId, actorId);
  return listExpenses(db, actorId, eq(expenses.groupId, groupId), options);
}

/** Expenses involving both people, in any group or none. */
export function listFriendExpenses(
  db: Db,
  actorId: number,
  friendId: number,
  options: PageOptions,
): ExpensePage {
  if (!areFriends(db, actorId, friendId)) throw new HttpError(404, 'NOT_FOUND', 'Friend not found');
  // Former members lose access to a group's expenses (SPEC §10), so leave those out.
  const myGroups = db
    .select({ id: groupMembers.groupId })
    .from(groupMembers)
    .where(and(eq(groupMembers.userId, actorId), isNull(groupMembers.leftAt)));
  const visible = or(isNull(expenses.groupId), inArray(expenses.groupId, myGroups));
  return listExpenses(
    db,
    actorId,
    and(involves(db, actorId), involves(db, friendId), visible)!,
    options,
  );
}
