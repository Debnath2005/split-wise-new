/**
 * Balances (SPEC §6, ADR-0006): computed from expenses (and, from M6, settlements) every time —
 * nothing is stored. Sign convention: positive = others owe you. All amounts are integer paise.
 * Callers pass only non-deleted rows within the scope they care about (a group, non-group, all).
 */
import { assertSafeInteger } from './money.js';

export interface LedgerExpense {
  paidByUserId: number;
  amountPaise: number;
  shares: { userId: number; owedPaise: number }[];
}

/** "from paid to" — reduces what `from` owes `to` (SPEC §6). */
export interface LedgerSettlement {
  fromUserId: number;
  toUserId: number;
  amountPaise: number;
}

export interface Ledger {
  expenses: LedgerExpense[];
  settlements?: LedgerSettlement[];
}

export interface Transfer {
  fromUserId: number;
  toUserId: number;
  amountPaise: number;
}

const add = (map: Map<number, number>, key: number, delta: number) =>
  map.set(key, (map.get(key) ?? 0) + delta);

function checkLedger({ expenses, settlements = [] }: Ledger): void {
  for (const e of expenses) {
    assertSafeInteger(e.amountPaise);
    for (const s of e.shares) assertSafeInteger(s.owedPaise);
  }
  for (const s of settlements) assertSafeInteger(s.amountPaise);
}

/**
 * net(u) = paid by u − owed by u + settlements u paid − settlements u received.
 * Σ net over everyone in the ledger is always 0.
 */
export function computeNets(ledger: Ledger): Map<number, number> {
  checkLedger(ledger);
  const nets = new Map<number, number>();
  for (const e of ledger.expenses) {
    add(nets, e.paidByUserId, e.amountPaise);
    for (const s of e.shares) add(nets, s.userId, -s.owedPaise);
  }
  for (const s of ledger.settlements ?? []) {
    add(nets, s.fromUserId, s.amountPaise);
    add(nets, s.toUserId, -s.amountPaise);
  }
  return nets;
}

/**
 * One person's balance with each other person (positive = they owe `userId`):
 * owes(B→A) = Σ share(B) on A's expenses − Σ share(A) on B's expenses − settlements B→A + A→B.
 * People who appear but net to zero are kept (so a UI can say "settled up").
 */
export function pairwiseFor(userId: number, ledger: Ledger): Map<number, number> {
  checkLedger(ledger);
  const balances = new Map<number, number>();
  for (const e of ledger.expenses) {
    if (e.paidByUserId === userId) {
      for (const s of e.shares) if (s.userId !== userId) add(balances, s.userId, s.owedPaise);
    } else {
      const mine = e.shares.find((s) => s.userId === userId);
      if (mine) add(balances, e.paidByUserId, -mine.owedPaise);
    }
  }
  for (const s of ledger.settlements ?? []) {
    if (s.fromUserId === userId) add(balances, s.toUserId, s.amountPaise);
    else if (s.toUserId === userId) add(balances, s.fromUserId, -s.amountPaise);
  }
  return balances;
}

/**
 * Raw who-pays-whom within a scope: debts netted per pair, no simplification (that's M7).
 * Sorted by payer id, then payee id, so the output is deterministic.
 */
export function pairwiseTransfers(ledger: Ledger): Transfer[] {
  checkLedger(ledger);
  // owed.get(`${a}:${b}`) = how much b owes a, before netting the pair.
  const owed = new Map<string, number>();
  const bump = (creditor: number, debtor: number, delta: number) => {
    const key = `${creditor}:${debtor}`;
    owed.set(key, (owed.get(key) ?? 0) + delta);
  };
  for (const e of ledger.expenses) {
    for (const s of e.shares)
      if (s.userId !== e.paidByUserId) bump(e.paidByUserId, s.userId, s.owedPaise);
  }
  for (const s of ledger.settlements ?? []) bump(s.toUserId, s.fromUserId, -s.amountPaise);

  const transfers: Transfer[] = [];
  const seen = new Set<string>();
  for (const key of owed.keys()) {
    const [a, b] = key.split(':').map(Number) as [number, number];
    const pairKey = a < b ? `${a}:${b}` : `${b}:${a}`;
    if (seen.has(pairKey)) continue;
    seen.add(pairKey);
    const bOwesA = (owed.get(`${a}:${b}`) ?? 0) - (owed.get(`${b}:${a}`) ?? 0);
    if (bOwesA > 0) transfers.push({ fromUserId: b, toUserId: a, amountPaise: bOwesA });
    else if (bOwesA < 0) transfers.push({ fromUserId: a, toUserId: b, amountPaise: -bOwesA });
  }
  return transfers.sort((x, y) => x.fromUserId - y.fromUserId || x.toUserId - y.toUserId);
}

export interface BalanceSummary {
  /** What you owe others in total (≥ 0). */
  owePaise: number;
  /** What others owe you in total (≥ 0). */
  owedPaise: number;
  /** owed − owe. */
  netPaise: number;
}

/** Dashboard totals (SPEC §6): the sums of the negative and positive pairwise balances. */
export function summarize(pairwise: Iterable<number>): BalanceSummary {
  let owePaise = 0;
  let owedPaise = 0;
  for (const balance of pairwise) {
    assertSafeInteger(balance);
    if (balance < 0) owePaise -= balance;
    else owedPaise += balance;
  }
  return { owePaise, owedPaise, netPaise: owedPaise - owePaise };
}
