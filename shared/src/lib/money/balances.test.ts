import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  computeNets,
  pairwiseFor,
  pairwiseTransfers,
  summarize,
  type Ledger,
  type LedgerExpense,
} from './balances.js';
import { computeSplit } from './split.js';

const [ASHA, RAVI, CHITRA] = [1, 2, 3];
const asObject = (m: Map<number, number>) => Object.fromEntries(m);

/** Hand-worked trip (see the M4 report for the arithmetic). */
const trip: Ledger = {
  expenses: [
    // E1: Asha pays ₹30.00, equal among all three → 1000 each.
    {
      paidByUserId: ASHA,
      amountPaise: 3000,
      shares: [ASHA, RAVI, CHITRA].map((userId) => ({ userId, owedPaise: 1000 })),
    },
    // E2: Ravi pays ₹12.00 by exact amounts, and isn't in the split himself.
    {
      paidByUserId: RAVI,
      amountPaise: 1200,
      shares: [
        { userId: ASHA, owedPaise: 200 },
        { userId: CHITRA, owedPaise: 1000 },
      ],
    },
    // E3: Chitra pays ₹1.00, equal → 34 / 33 / 33 (lowest id gets the extra paisa).
    {
      paidByUserId: CHITRA,
      amountPaise: 100,
      shares: [
        { userId: ASHA, owedPaise: 34 },
        { userId: RAVI, owedPaise: 33 },
        { userId: CHITRA, owedPaise: 33 },
      ],
    },
  ],
};

describe('hand-calculated trip fixture', () => {
  it('nets: Asha +1766, Ravi +167, Chitra −1933', () => {
    expect(asObject(computeNets(trip))).toEqual({ [ASHA]: 1766, [RAVI]: 167, [CHITRA]: -1933 });
  });

  it('pairwise from each person’s point of view', () => {
    expect(asObject(pairwiseFor(ASHA, trip))).toEqual({ [RAVI]: 800, [CHITRA]: 966 });
    expect(asObject(pairwiseFor(RAVI, trip))).toEqual({ [ASHA]: -800, [CHITRA]: 967 });
    expect(asObject(pairwiseFor(CHITRA, trip))).toEqual({ [ASHA]: -966, [RAVI]: -967 });
  });

  it('raw transfers, netted per pair and sorted', () => {
    expect(pairwiseTransfers(trip)).toEqual([
      { fromUserId: RAVI, toUserId: ASHA, amountPaise: 800 },
      { fromUserId: CHITRA, toUserId: ASHA, amountPaise: 966 },
      { fromUserId: CHITRA, toUserId: RAVI, amountPaise: 967 },
    ]);
  });

  it('dashboard summaries', () => {
    expect(summarize(pairwiseFor(ASHA, trip).values())).toEqual({
      owePaise: 0,
      owedPaise: 1766,
      netPaise: 1766,
    });
    expect(summarize(pairwiseFor(RAVI, trip).values())).toEqual({
      owePaise: 800,
      owedPaise: 967,
      netPaise: 167,
    });
    expect(summarize(pairwiseFor(CHITRA, trip).values())).toEqual({
      owePaise: 1933,
      owedPaise: 0,
      netPaise: -1933,
    });
  });

  it('a settlement reduces the payer’s debt (ready for M6)', () => {
    const settled: Ledger = {
      ...trip,
      settlements: [{ fromUserId: CHITRA, toUserId: ASHA, amountPaise: 966 }],
    };
    expect(pairwiseFor(ASHA, settled).get(CHITRA)).toBe(0);
    expect(asObject(computeNets(settled))).toEqual({ [ASHA]: 800, [RAVI]: 167, [CHITRA]: -967 });
    expect(
      pairwiseTransfers(settled).some((t) => t.fromUserId === CHITRA && t.toUserId === ASHA),
    ).toBe(false);
  });

  it('keeps people who net to zero so the UI can say "settled up"', () => {
    const even: Ledger = {
      expenses: [
        { paidByUserId: ASHA, amountPaise: 500, shares: [{ userId: RAVI, owedPaise: 500 }] },
        { paidByUserId: RAVI, amountPaise: 500, shares: [{ userId: ASHA, owedPaise: 500 }] },
      ],
    };
    expect(asObject(pairwiseFor(ASHA, even))).toEqual({ [RAVI]: 0 });
    expect(pairwiseTransfers(even)).toEqual([]);
  });

  it('rejects non-integer amounts', () => {
    expect(() =>
      computeNets({ expenses: [{ paidByUserId: 1, amountPaise: 1.5, shares: [] }] }),
    ).toThrow(TypeError);
  });
});

describe('invariants (property-based)', () => {
  const people = [1, 2, 3, 4, 5];

  /** Random valid expenses built with the real split function, so shares always sum to the amount. */
  const expense: fc.Arbitrary<LedgerExpense> = fc
    .record({
      payer: fc.constantFrom(...people),
      amount: fc.integer({ min: 1, max: 10_000_000 }),
      participants: fc.subarray(people, { minLength: 1 }),
    })
    .map(({ payer, amount, participants }) => {
      const result = computeSplit({
        amountPaise: amount,
        splitType: 'equal',
        participants: participants.map((userId) => ({ userId })),
      });
      if (!result.ok) throw new Error('unexpected split failure');
      return {
        paidByUserId: payer,
        amountPaise: amount,
        shares: result.shares.map((s) => ({ userId: s.userId, owedPaise: s.owedPaise })),
      };
    });
  const ledger = fc.record({
    expenses: fc.array(expense, { maxLength: 25 }),
    settlements: fc.array(
      fc
        .tuple(
          fc.constantFrom(...people),
          fc.constantFrom(...people),
          fc.integer({ min: 1, max: 100_000 }),
        )
        .filter(([from, to]) => from !== to)
        .map(([fromUserId, toUserId, amountPaise]) => ({ fromUserId, toUserId, amountPaise })),
      { maxLength: 5 },
    ),
  });

  it('Σ net = 0 for any ledger', () => {
    fc.assert(
      fc.property(ledger, (l) => {
        expect([...computeNets(l).values()].reduce((a, b) => a + b, 0)).toBe(0);
      }),
    );
  });

  it('pairwise is antisymmetric: A→B = −(B→A)', () => {
    fc.assert(
      fc.property(ledger, fc.constantFrom(...people), fc.constantFrom(...people), (l, a, b) => {
        fc.pre(a !== b);
        const aToB = pairwiseFor(a, l).get(b) ?? 0;
        const bToA = pairwiseFor(b, l).get(a) ?? 0;
        expect(aToB + bToA).toBe(0); // compare the sum: -(0) is -0, which toBe treats as different
        expect(Object.is(aToB, -0) || Object.is(bToA, -0)).toBe(false); // and never return -0 ("-₹0.00")
      }),
    );
  });

  it("within one scope, a person's pairwise balances sum to their net", () => {
    fc.assert(
      fc.property(ledger, fc.constantFrom(...people), (l, person) => {
        const total = [...pairwiseFor(person, l).values()].reduce((a, b) => a + b, 0);
        expect(total).toBe(computeNets(l).get(person) ?? 0);
      }),
    );
  });

  it('paying every raw transfer brings every net to zero', () => {
    fc.assert(
      fc.property(ledger, (l) => {
        const transfers = pairwiseTransfers(l);
        expect(transfers.every((t) => t.amountPaise > 0 && t.fromUserId !== t.toUserId)).toBe(true);
        const after = computeNets({
          expenses: l.expenses,
          settlements: [
            ...l.settlements,
            ...transfers.map((t) => ({
              fromUserId: t.fromUserId,
              toUserId: t.toUserId,
              amountPaise: t.amountPaise,
            })),
          ],
        });
        expect([...after.values()].every((n) => n === 0)).toBe(true);
      }),
    );
  });
});
