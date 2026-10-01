/**
 * What one expense means for one person (SPEC §11 expense lists): what they paid minus their share.
 * Positive ⇒ they lent that much, negative ⇒ they borrowed it, 0 ⇒ even or not involved.
 * This is per-expense arithmetic, not a running balance (balances come from SPEC §6).
 */
import { assertSafeInteger } from './money.js';

export interface ExpenseForImpact {
  amountPaise: number;
  paidByUserId: number;
  /** The person's owed share in paise; 0 if they aren't a participant. */
  mySharePaise: number;
}

export function expenseImpact(
  { amountPaise, paidByUserId, mySharePaise }: ExpenseForImpact,
  userId: number,
): number {
  assertSafeInteger(amountPaise);
  assertSafeInteger(mySharePaise);
  return (paidByUserId === userId ? amountPaise : 0) - mySharePaise;
}
