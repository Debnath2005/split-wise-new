import { describe, expect, it } from 'vitest';
import { expenseImpact } from './impact.js';

const expense = { amountPaise: 120000, paidByUserId: 1 };

describe('expenseImpact', () => {
  it('payer who is also a participant lent everything except their own share', () => {
    expect(expenseImpact({ ...expense, mySharePaise: 40000 }, 1)).toBe(80000);
  });

  it('payer who is not a participant lent the whole amount', () => {
    expect(expenseImpact({ ...expense, mySharePaise: 0 }, 1)).toBe(120000);
  });

  it('participant who did not pay borrowed their share', () => {
    expect(expenseImpact({ ...expense, mySharePaise: 40000 }, 2)).toBe(-40000);
  });

  it('someone not involved is at zero', () => {
    expect(expenseImpact({ ...expense, mySharePaise: 0 }, 3)).toBe(0);
  });

  it('rejects non-integer amounts', () => {
    expect(() => expenseImpact({ ...expense, mySharePaise: 0.5 }, 2)).toThrow(TypeError);
  });
});
