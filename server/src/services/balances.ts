/**
 * Balance queries (SPEC §6, ADR-0006). This module only *loads* non-deleted rows; every
 * calculation is done by the pure functions in shared/lib/money (CLAUDE.md).
 */
import { and, eq, inArray, isNull, type SQL } from 'drizzle-orm';
import {
  computeNets,
  pairwiseFor,
  pairwiseTransfers,
  summarize,
  type BalanceSummaryResponse,
  type FriendDetailResponse,
  type GroupBalancesResponse,
  type LedgerExpense,
} from '@split-wise/shared';
import type { DbOrTx } from '../db/client.js';
import { expenseShares, expenses, groupMembers, groups, users } from '../db/schema.js';
import { involves } from './sqlFragments.js';

type ScopedExpense = LedgerExpense & { groupId: number | null };

/** Loads non-deleted expenses matching `where`, with their shares. */
export function loadLedger(db: DbOrTx, where: SQL | undefined): ScopedExpense[] {
  const rows = db
    .select({
      id: expenses.id,
      groupId: expenses.groupId,
      paidByUserId: expenses.paidByUserId,
      amountPaise: expenses.amountPaise,
    })
    .from(expenses)
    .where(and(isNull(expenses.deletedAt), where))
    .all();
  if (rows.length === 0) return [];

  const shares = db
    .select({
      expenseId: expenseShares.expenseId,
      userId: expenseShares.userId,
      owedPaise: expenseShares.owedPaise,
    })
    .from(expenseShares)
    .where(
      inArray(
        expenseShares.expenseId,
        rows.map((r) => r.id),
      ),
    )
    .all();
  const byExpense = new Map<number, { userId: number; owedPaise: number }[]>();
  for (const s of shares) {
    const list = byExpense.get(s.expenseId) ?? [];
    list.push({ userId: s.userId, owedPaise: s.owedPaise });
    byExpense.set(s.expenseId, list);
  }
  return rows.map((r) => ({
    groupId: r.groupId,
    paidByUserId: r.paidByUserId,
    amountPaise: r.amountPaise,
    shares: byExpense.get(r.id) ?? [],
  }));
}

/** Your pairwise balance with everyone, across all groups and non-group (positive = they owe you). */
export function balancesWithEveryone(db: DbOrTx, userId: number): Map<number, number> {
  return pairwiseFor(userId, { expenses: loadLedger(db, involves(db, userId)) });
}

export function balanceSummary(db: DbOrTx, userId: number): BalanceSummaryResponse {
  const { owePaise, owedPaise, netPaise } = summarize(balancesWithEveryone(db, userId).values());
  return { owe_paise: owePaise, owed_paise: owedPaise, net_paise: netPaise };
}

/** Pairwise balance with one friend: per scope (each group, and non-group) plus the total. */
export function balanceWithFriend(
  db: DbOrTx,
  userId: number,
  friendId: number,
): FriendDetailResponse['balance'] {
  const ledger = loadLedger(db, and(involves(db, userId), involves(db, friendId)));
  const scopes = new Map<number | null, ScopedExpense[]>();
  for (const e of ledger) scopes.set(e.groupId, [...(scopes.get(e.groupId) ?? []), e]);

  const groupIds = [...scopes.keys()].filter((id): id is number => id !== null);
  const names = new Map(
    groupIds.length
      ? db
          .select({ id: groups.id, name: groups.name })
          .from(groups)
          .where(inArray(groups.id, groupIds))
          .all()
          .map((g) => [g.id, g.name])
      : [],
  );

  const byScope = [...scopes.entries()]
    .map(([groupId, list]) => ({
      group: groupId === null ? null : { id: groupId, name: names.get(groupId) ?? '' },
      balance_paise: pairwiseFor(userId, { expenses: list }).get(friendId) ?? 0,
    }))
    // Groups by name, then non-group last.
    .sort((a, b) =>
      a.group && b.group ? a.group.name.localeCompare(b.group.name) : a.group ? -1 : 1,
    );

  return {
    total_paise: byScope.reduce((sum, s) => sum + s.balance_paise, 0),
    by_scope: byScope,
  };
}

const groupLedger = (db: DbOrTx, groupId: number) => loadLedger(db, eq(expenses.groupId, groupId));

/** Your net in each of the given groups (0 when you have no expenses there). */
export function myNetsInGroups(
  db: DbOrTx,
  userId: number,
  groupIds: number[],
): Map<number, number> {
  const result = new Map<number, number>();
  if (groupIds.length === 0) return result;
  const ledger = loadLedger(db, inArray(expenses.groupId, groupIds));
  for (const groupId of groupIds) {
    const nets = computeNets({ expenses: ledger.filter((e) => e.groupId === groupId) });
    result.set(groupId, nets.get(userId) ?? 0);
  }
  return result;
}

/** Your pairwise balances with each person inside one group (used to allow leaving). */
export function pairwiseInGroup(db: DbOrTx, userId: number, groupId: number): Map<number, number> {
  return pairwiseFor(userId, { expenses: groupLedger(db, groupId) });
}

/**
 * Member nets and who-pays-whom for a group (SPEC §6 "Group balances"). Raw pairwise transfers
 * until simplify debts arrives in M7. Caller must have checked membership.
 */
export function groupBalances(db: DbOrTx, groupId: number): GroupBalancesResponse {
  const ledger = { expenses: groupLedger(db, groupId) };
  const nets = computeNets(ledger);
  const transfers = pairwiseTransfers(ledger);

  const memberIds = db
    .select({ id: groupMembers.userId })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), isNull(groupMembers.leftAt)))
    .all()
    .map((r) => r.id);
  // Current members, plus any former member who still appears in the ledger.
  const ids = [...new Set([...memberIds, ...nets.keys()])];
  const people = new Map(
    db
      .select({ id: users.id, name: users.name, is_placeholder: users.isPlaceholder })
      .from(users)
      .where(inArray(users.id, ids))
      .all()
      .map((u) => [u.id, u]),
  );
  const ref = (id: number) => people.get(id)!;

  return {
    members: ids
      .map((id) => ({ user: ref(id), net_paise: nets.get(id) ?? 0 }))
      .sort((a, b) => b.net_paise - a.net_paise || a.user.id - b.user.id),
    transfers: transfers.map((t) => ({
      from: ref(t.fromUserId),
      to: ref(t.toUserId),
      amount_paise: t.amountPaise,
    })),
    simplified: false,
  };
}
