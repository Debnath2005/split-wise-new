/**
 * Simplify debts (SPEC §7, ADR-0012): greedy and deterministic. Repeatedly the largest creditor
 * and the largest debtor (ties → lower user id) settle min(credit, debt). At most n − 1 transfers,
 * all positive integer paise. Not always the global minimum (that problem is NP-hard).
 */
import { computeNets, pairwiseTransfers, type Ledger, type Transfer } from './balances.js';
import { assertSafeInteger } from './money.js';

export function simplifyDebts(nets: ReadonlyMap<number, number>): Transfer[] {
  const creditors: { id: number; amount: number }[] = [];
  const debtors: { id: number; amount: number }[] = [];
  let sum = 0;
  for (const [id, net] of nets) {
    assertSafeInteger(net);
    sum += net;
    if (net > 0) creditors.push({ id, amount: net });
    else if (net < 0) debtors.push({ id, amount: -net });
  }
  if (sum !== 0) throw new RangeError(`Nets must sum to zero (got ${sum})`);

  // Largest first; ties by ascending user id.
  const byLargest = (a: { id: number; amount: number }, b: { id: number; amount: number }) =>
    b.amount - a.amount || a.id - b.id;

  const transfers: Transfer[] = [];
  while (creditors.length && debtors.length) {
    creditors.sort(byLargest);
    debtors.sort(byLargest);
    const c = creditors[0]!;
    const d = debtors[0]!;
    const amount = Math.min(c.amount, d.amount);
    transfers.push({ fromUserId: d.id, toUserId: c.id, amountPaise: amount });
    c.amount -= amount;
    d.amount -= amount;
    if (c.amount === 0) creditors.shift();
    if (d.amount === 0) debtors.shift();
  }
  return transfers;
}

/** A group's who-pays-whom: simplified when the group's switch is on, raw pairwise otherwise. */
export function groupTransfers(ledger: Ledger, simplify: boolean): Transfer[] {
  return simplify ? simplifyDebts(computeNets(ledger)) : pairwiseTransfers(ledger);
}

/**
 * One person's balance with each other person implied by a list of transfers
 * (positive = they owe `userId`). Used so friend views match a simplified group (SPEC §6).
 */
export function pairwiseFromTransfers(
  userId: number,
  transfers: readonly Transfer[],
): Map<number, number> {
  const balances = new Map<number, number>();
  for (const t of transfers) {
    if (t.toUserId === userId)
      balances.set(t.fromUserId, (balances.get(t.fromUserId) ?? 0) + t.amountPaise);
    else if (t.fromUserId === userId)
      balances.set(t.toUserId, (balances.get(t.toUserId) ?? 0) - t.amountPaise);
  }
  return balances;
}
