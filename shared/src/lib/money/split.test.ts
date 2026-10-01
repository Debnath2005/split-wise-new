import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { MAX_AMOUNT_PAISE } from './money.js';
import { computeSplit, type Share, type SplitParticipant } from './split.js';

const owed = (shares: Share[]) => shares.map((s) => [s.userId, s.owedPaise]);

function ok(result: ReturnType<typeof computeSplit>): Share[] {
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result.error)}`);
  return result.shares;
}

describe('equal split', () => {
  it('gives the extra paisa to the lowest user ids (₹100 / 3)', () => {
    const shares = ok(
      computeSplit({
        amountPaise: 10000,
        splitType: 'equal',
        participants: [{ userId: 9 }, { userId: 2 }, { userId: 5 }],
      }),
    );
    expect(owed(shares)).toEqual([
      [2, 3334],
      [5, 3333],
      [9, 3333],
    ]);
    expect(shares.every((s) => s.inputValue === null)).toBe(true);
  });

  it('handles an amount smaller than the number of people', () => {
    const shares = ok(
      computeSplit({
        amountPaise: 2,
        splitType: 'equal',
        participants: [{ userId: 1 }, { userId: 2 }, { userId: 3 }],
      }),
    );
    expect(owed(shares)).toEqual([
      [1, 1],
      [2, 1],
      [3, 0],
    ]);
  });
});

describe('exact split', () => {
  it('stores each entered share as owed and as input', () => {
    const shares = ok(
      computeSplit({
        amountPaise: 50000,
        splitType: 'exact',
        participants: [
          { userId: 2, value: 20000 },
          { userId: 1, value: 30000 },
        ],
      }),
    );
    expect(shares).toEqual([
      { userId: 1, owedPaise: 30000, inputValue: 30000 },
      { userId: 2, owedPaise: 20000, inputValue: 20000 },
    ]);
  });

  it('allows a zero share', () => {
    const shares = ok(
      computeSplit({
        amountPaise: 100,
        splitType: 'exact',
        participants: [
          { userId: 1, value: 100 },
          { userId: 2, value: 0 },
        ],
      }),
    );
    expect(owed(shares)).toEqual([
      [1, 100],
      [2, 0],
    ]);
  });

  it.each([
    [40000, 10000],
    [60000, -10000],
  ])('reports SPLIT_SUM_MISMATCH when shares sum to %i of 50000', (sum, remaining) => {
    const result = computeSplit({
      amountPaise: 50000,
      splitType: 'exact',
      participants: [
        { userId: 1, value: sum - 100 },
        { userId: 2, value: 100 },
      ],
    });
    expect(result).toEqual({
      ok: false,
      error: { code: 'SPLIT_SUM_MISMATCH', expected: 50000, actual: sum, remaining },
    });
  });

  it.each([[undefined], [-1], [1.5]])('rejects share value %j', (value) => {
    const result = computeSplit({
      amountPaise: 100,
      splitType: 'exact',
      participants: [{ userId: 1, value }],
    });
    expect(result.ok || result.error.code).toBe('INVALID_SPLIT');
  });
});

describe('percent split', () => {
  it('gives leftover paise to the largest remainders (₹1.00 at 33.33/33.33/33.34%)', () => {
    const shares = ok(
      computeSplit({
        amountPaise: 100,
        splitType: 'percent',
        participants: [
          { userId: 1, value: 3333 },
          { userId: 2, value: 3333 },
          { userId: 3, value: 3334 },
        ],
      }),
    );
    // raw: 333300 / 333300 / 333400 → floors 33/33/33, fractions 3300/3300/3400 → user 3 gets the paisa.
    expect(owed(shares)).toEqual([
      [1, 33],
      [2, 33],
      [3, 34],
    ]);
    expect(shares.map((s) => s.inputValue)).toEqual([3333, 3333, 3334]);
  });

  it('breaks remainder ties by ascending user id', () => {
    const shares = ok(
      computeSplit({
        amountPaise: 1001,
        splitType: 'percent',
        participants: [
          { userId: 7, value: 5000 },
          { userId: 3, value: 5000 },
        ],
      }),
    );
    expect(owed(shares)).toEqual([
      [3, 501],
      [7, 500],
    ]);
  });

  it('reports SPLIT_SUM_MISMATCH in basis points', () => {
    const result = computeSplit({
      amountPaise: 1000,
      splitType: 'percent',
      participants: [
        { userId: 1, value: 5000 },
        { userId: 2, value: 4000 },
      ],
    });
    expect(result).toEqual({
      ok: false,
      error: { code: 'SPLIT_SUM_MISMATCH', expected: 10000, actual: 9000, remaining: 1000 },
    });
  });

  it('rejects a percentage above 100%', () => {
    const result = computeSplit({
      amountPaise: 1000,
      splitType: 'percent',
      participants: [
        { userId: 1, value: 10001 },
        { userId: 2, value: -1 },
      ],
    });
    expect(result.ok || result.error.code).toBe('INVALID_SPLIT');
  });
});

describe('input validation', () => {
  it.each([
    ['zero amount', { amountPaise: 0 }],
    ['fractional amount', { amountPaise: 10.5 }],
    ['amount over the limit', { amountPaise: MAX_AMOUNT_PAISE + 1 }],
    ['no participants', { participants: [] }],
    ['duplicate participants', { participants: [{ userId: 1 }, { userId: 1 }] }],
    ['invalid user id', { participants: [{ userId: 0 }] }],
  ])('rejects %s', (_name, override) => {
    const result = computeSplit({
      amountPaise: 1000,
      splitType: 'equal',
      participants: [{ userId: 1 }],
      ...override,
    });
    expect(result.ok || result.error.code).toBe('INVALID_SPLIT');
  });
});

describe('invariants (property-based)', () => {
  const amount = fc.integer({ min: 1, max: MAX_AMOUNT_PAISE });
  const userIds = fc.uniqueArray(fc.integer({ min: 1, max: 10_000 }), {
    minLength: 1,
    maxLength: 50,
  });

  /** Random basis points for n people that sum to exactly 10000. */
  const basisPoints = (n: number) =>
    fc
      .array(fc.integer({ min: 0, max: 10000 }), { minLength: n - 1, maxLength: n - 1 })
      .map((cuts) => {
        const points = [0, ...cuts.sort((a, b) => a - b), 10000];
        return points.slice(1).map((p, i) => p - points[i]!);
      });

  const sum = (shares: Share[]) => shares.reduce((s, x) => s + x.owedPaise, 0);

  it('equal: shares sum to the amount and differ by at most 1 paisa', () => {
    fc.assert(
      fc.property(amount, userIds, (amountPaise, ids) => {
        const shares = ok(
          computeSplit({
            amountPaise,
            splitType: 'equal',
            participants: ids.map((userId) => ({ userId })),
          }),
        );
        expect(sum(shares)).toBe(amountPaise);
        const values = shares.map((s) => s.owedPaise);
        expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1);
      }),
    );
  });

  it('percent: shares sum to the amount and each is within 1 paisa of its exact share', () => {
    fc.assert(
      fc.property(
        amount,
        userIds.chain((ids) => fc.tuple(fc.constant(ids), basisPoints(ids.length))),
        (amountPaise, [ids, bps]) => {
          const participants = ids.map((userId, i) => ({ userId, value: bps[i]! }));
          const shares = ok(computeSplit({ amountPaise, splitType: 'percent', participants }));
          expect(sum(shares)).toBe(amountPaise);
          for (const s of shares) {
            const bp = participants.find((p) => p.userId === s.userId)!.value;
            const exact = (amountPaise * bp) / 10000;
            expect(Math.abs(s.owedPaise - exact)).toBeLessThan(1);
          }
        },
      ),
    );
  });

  it('result does not depend on participant order', () => {
    fc.assert(
      fc.property(
        amount,
        userIds.chain((ids) =>
          fc.tuple(
            fc.constant(ids),
            basisPoints(ids.length),
            fc.shuffledSubarray(ids, { minLength: ids.length }),
          ),
        ),
        (amountPaise, [ids, bps, shuffledIds]) => {
          const byId = new Map(ids.map((id, i) => [id, bps[i]!]));
          const make = (order: number[]): SplitParticipant[] =>
            order.map((userId) => ({ userId, value: byId.get(userId)! }));
          for (const splitType of ['equal', 'percent'] as const) {
            expect(computeSplit({ amountPaise, splitType, participants: make(ids) })).toEqual(
              computeSplit({ amountPaise, splitType, participants: make(shuffledIds) }),
            );
          }
        },
      ),
    );
  });
});
