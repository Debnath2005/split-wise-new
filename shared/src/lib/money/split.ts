/**
 * Split algorithms (SPEC §4.1, ADR-0002, ADR-0008). Pure and deterministic: participants are
 * processed in ascending user id order, so the same input always yields the same shares,
 * and the shares always sum to the expense amount.
 */
import { FULL_PERCENT_BP, MAX_AMOUNT_PAISE } from './money.js';

export const SPLIT_TYPES = ['equal', 'exact', 'percent'] as const;
export type SplitType = (typeof SPLIT_TYPES)[number];

export interface SplitParticipant {
  userId: number;
  /** exact: share in paise; percent: basis points; equal: ignored. */
  value?: number;
}

export interface Share {
  userId: number;
  owedPaise: number;
  /** The value the user entered (stored as `expense_shares.input_value`); null for equal splits. */
  inputValue: number | null;
}

export type SplitError =
  | {
      code: 'SPLIT_SUM_MISMATCH';
      /** Paise for exact splits, basis points for percent splits. */
      expected: number;
      actual: number;
      /** expected − actual: positive means "left to assign", negative means over-assigned. */
      remaining: number;
    }
  | { code: 'INVALID_SPLIT'; message: string };

export type SplitResult = { ok: true; shares: Share[] } | { ok: false; error: SplitError };

export interface SplitInput {
  amountPaise: number;
  splitType: SplitType;
  participants: SplitParticipant[];
}

const invalid = (message: string): SplitResult => ({
  ok: false,
  error: { code: 'INVALID_SPLIT', message },
});

const isNonNegativeInt = (n: unknown): n is number =>
  typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;

export function computeSplit({ amountPaise, splitType, participants }: SplitInput): SplitResult {
  if (!Number.isSafeInteger(amountPaise) || amountPaise < 1 || amountPaise > MAX_AMOUNT_PAISE) {
    return invalid(`Amount must be between 1 and ${MAX_AMOUNT_PAISE} paise`);
  }
  if (participants.length === 0) return invalid('At least one participant is required');

  const ids = new Set<number>();
  for (const p of participants) {
    if (!Number.isSafeInteger(p.userId) || p.userId < 1) return invalid('Invalid participant id');
    if (ids.has(p.userId)) return invalid('Each participant may appear only once');
    ids.add(p.userId);
  }

  const sorted = [...participants].sort((a, b) => a.userId - b.userId);

  switch (splitType) {
    case 'equal':
      return splitEqual(amountPaise, sorted);
    case 'exact':
      return splitExact(amountPaise, sorted);
    case 'percent':
      return splitPercent(amountPaise, sorted);
    default:
      return invalid('Unknown split type');
  }
}

/** The first `r` participants (by user id) absorb the leftover paise, one each. */
function splitEqual(amount: number, sorted: SplitParticipant[]): SplitResult {
  const n = sorted.length;
  const base = Math.floor(amount / n);
  const remainder = amount - base * n;
  return {
    ok: true,
    shares: sorted.map((p, i) => ({
      userId: p.userId,
      owedPaise: base + (i < remainder ? 1 : 0),
      inputValue: null,
    })),
  };
}

function splitExact(amount: number, sorted: SplitParticipant[]): SplitResult {
  let sum = 0;
  for (const p of sorted) {
    if (!isNonNegativeInt(p.value))
      return invalid('Each exact share must be a whole number of paise ≥ 0');
    sum += p.value;
  }
  if (sum !== amount) {
    return {
      ok: false,
      error: { code: 'SPLIT_SUM_MISMATCH', expected: amount, actual: sum, remaining: amount - sum },
    };
  }
  return {
    ok: true,
    shares: sorted.map((p) => ({ userId: p.userId, owedPaise: p.value!, inputValue: p.value! })),
  };
}

/**
 * owed_i = floor(A × bp_i / 10000). The leftover paise go one at a time to the participants with
 * the largest discarded remainder, ties broken by ascending user id.
 */
function splitPercent(amount: number, sorted: SplitParticipant[]): SplitResult {
  let sumBp = 0;
  for (const p of sorted) {
    if (!isNonNegativeInt(p.value) || p.value > FULL_PERCENT_BP) {
      return invalid('Each percentage must be between 0 and 100 with at most 2 decimals');
    }
    sumBp += p.value;
  }
  if (sumBp !== FULL_PERCENT_BP) {
    return {
      ok: false,
      error: {
        code: 'SPLIT_SUM_MISMATCH',
        expected: FULL_PERCENT_BP,
        actual: sumBp,
        remaining: FULL_PERCENT_BP - sumBp,
      },
    };
  }

  // amount ≤ 1e8 and bp ≤ 1e4, so raw ≤ 1e12: exact integer arithmetic.
  const rows = sorted.map((p, index) => {
    const raw = amount * p.value!;
    const fraction = raw % FULL_PERCENT_BP;
    return { p, index, owed: (raw - fraction) / FULL_PERCENT_BP, fraction };
  });

  let leftover = amount - rows.reduce((s, r) => s + r.owed, 0);
  const byFraction = [...rows].sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (const row of byFraction) {
    if (leftover === 0) break;
    row.owed += 1;
    leftover -= 1;
  }

  return {
    ok: true,
    shares: rows.map((r) => ({ userId: r.p.userId, owedPaise: r.owed, inputValue: r.p.value! })),
  };
}
