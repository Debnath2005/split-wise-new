import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { computeNets, pairwiseFor, pairwiseTransfers, type Ledger } from './balances.js';
import { groupTransfers, pairwiseFromTransfers, simplifyDebts } from './simplify.js';

const [A, B, C, D] = [1, 2, 3, 4];
const nets = (entries: [number, number][]) => new Map(entries);

/** Apply transfers as payments and return the resulting nets. */
function afterPaying(start: Map<number, number>, transfers: ReturnType<typeof simplifyDebts>) {
  const result = new Map(start);
  for (const t of transfers) {
    result.set(t.fromUserId, (result.get(t.fromUserId) ?? 0) + t.amountPaise);
    result.set(t.toUserId, (result.get(t.toUserId) ?? 0) - t.amountPaise);
  }
  return result;
}

/** A pays for B, B for C, C for D, D for A — each a single-person expense. */
const circle = (amounts: [number, number, number, number]): Ledger => ({
  expenses: [
    { paidByUserId: A, amountPaise: amounts[0], shares: [{ userId: B, owedPaise: amounts[0] }] },
    { paidByUserId: B, amountPaise: amounts[1], shares: [{ userId: C, owedPaise: amounts[1] }] },
    { paidByUserId: C, amountPaise: amounts[2], shares: [{ userId: D, owedPaise: amounts[2] }] },
    { paidByUserId: D, amountPaise: amounts[3], shares: [{ userId: A, owedPaise: amounts[3] }] },
  ],
});

describe('simplifyDebts — DoD: circular debt A→B→C→D→A', () => {
  it('equal amounts cancel out completely: 0 transfers instead of 4', () => {
    const ledger = circle([500, 500, 500, 500]);
    expect(pairwiseTransfers(ledger)).toHaveLength(4);
    expect(simplifyDebts(computeNets(ledger))).toEqual([]);
  });

  it('uneven amounts: ≤ 3 transfers, and paying them zeroes every net', () => {
    const ledger = circle([100, 200, 300, 400]);
    const start = computeNets(ledger);
    // A: +100 −400 = −300 · B: +200 −100 = +100 · C: +300 −200 = +100 · D: +400 −300 = +100
    expect(Object.fromEntries(start)).toEqual({ [A]: -300, [B]: 100, [C]: 100, [D]: 100 });
    const transfers = simplifyDebts(start);
    expect(transfers.length).toBeLessThanOrEqual(3);
    expect(transfers).toEqual([
      { fromUserId: A, toUserId: B, amountPaise: 100 },
      { fromUserId: A, toUserId: C, amountPaise: 100 },
      { fromUserId: A, toUserId: D, amountPaise: 100 },
    ]);
    expect([...afterPaying(start, transfers).values()].every((n) => n === 0)).toBe(true);
  });
});

describe('simplifyDebts — rules', () => {
  it('matches the largest creditor with the largest debtor', () => {
    // M4 trip: Asha +1766, Ravi +167, Chitra −1933 → Chitra pays Asha 1766, then Ravi 167.
    expect(
      simplifyDebts(
        nets([
          [1, 1766],
          [2, 167],
          [3, -1933],
        ]),
      ),
    ).toEqual([
      { fromUserId: 3, toUserId: 1, amountPaise: 1766 },
      { fromUserId: 3, toUserId: 2, amountPaise: 167 },
    ]);
  });

  it('breaks ties by the lower user id', () => {
    expect(
      simplifyDebts(
        nets([
          [4, 100],
          [2, 100],
          [3, -100],
          [1, -100],
        ]),
      ),
    ).toEqual([
      { fromUserId: 1, toUserId: 2, amountPaise: 100 },
      { fromUserId: 3, toUserId: 4, amountPaise: 100 },
    ]);
  });

  it('ignores zeros and returns nothing when everyone is settled', () => {
    expect(
      simplifyDebts(
        nets([
          [1, 0],
          [2, 0],
        ]),
      ),
    ).toEqual([]);
    expect(simplifyDebts(new Map())).toEqual([]);
  });

  it('rejects nets that do not sum to zero or are not integers', () => {
    expect(() =>
      simplifyDebts(
        nets([
          [1, 100],
          [2, -99],
        ]),
      ),
    ).toThrow(RangeError);
    expect(() =>
      simplifyDebts(
        nets([
          [1, 0.5],
          [2, -0.5],
        ]),
      ),
    ).toThrow(TypeError);
  });
});

describe('groupTransfers / pairwiseFromTransfers', () => {
  it('raw mode reproduces pairwiseFor exactly', () => {
    const ledger = circle([100, 200, 300, 400]);
    for (const person of [A, B, C, D]) {
      const fromTransfers = pairwiseFromTransfers(person, groupTransfers(ledger, false));
      const direct = [...pairwiseFor(person, ledger)].filter(([, v]) => v !== 0);
      expect(Object.fromEntries(fromTransfers)).toEqual(Object.fromEntries(direct));
    }
  });

  it('simplified mode gives each person balances that still sum to their net', () => {
    const ledger = circle([100, 200, 300, 400]);
    const transfers = groupTransfers(ledger, true);
    expect(Object.fromEntries(pairwiseFromTransfers(A, transfers))).toEqual({
      [B]: -100,
      [C]: -100,
      [D]: -100,
    });
    expect(Object.fromEntries(pairwiseFromTransfers(B, transfers))).toEqual({ [A]: 100 });
  });
});

describe('invariants (property-based)', () => {
  /** Random nets for up to 8 people that sum to zero. */
  const zeroSumNets = fc
    .array(fc.integer({ min: -1_000_000, max: 1_000_000 }), { minLength: 1, maxLength: 7 })
    .map((values) => {
      const all = [...values, -values.reduce((a, b) => a + b, 0)];
      return new Map(all.map((v, i) => [i + 1, v]));
    });

  it('paying the transfers zeroes every net, with ≤ n−1 positive transfers', () => {
    fc.assert(
      fc.property(zeroSumNets, (n) => {
        const transfers = simplifyDebts(n);
        const people = [...n.values()].filter((v) => v !== 0).length;
        expect(transfers.length).toBeLessThanOrEqual(Math.max(people - 1, 0));
        expect(
          transfers.every(
            (t) =>
              t.amountPaise > 0 &&
              Number.isSafeInteger(t.amountPaise) &&
              t.fromUserId !== t.toUserId,
          ),
        ).toBe(true);
        expect([...afterPaying(n, transfers).values()].every((v) => v === 0)).toBe(true);
      }),
    );
  });

  it('is deterministic: the order of the input does not matter', () => {
    fc.assert(
      fc.property(zeroSumNets, (n) => {
        const reversed = new Map([...n].reverse());
        expect(simplifyDebts(reversed)).toEqual(simplifyDebts(n));
      }),
    );
  });
});
