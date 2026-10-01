import { describe, expect, it } from 'vitest';
import type { ActivityItem, ExpenseSnapshot } from '@split-wise/shared';
import { formatShortDate } from '../../lib/dates';
import { describeActivity, diffExpense } from './describe';

const ME = 1;
const people = { '1': 'Asha', '2': 'Ravi', '3': 'Chitra', '4': 'Dev' };
const text = (item: ActivityItem, me = ME) =>
  describeActivity(item, people, me)
    .sentence.map((s) => s.text)
    .join('');

const base = {
  id: 10,
  actor: { id: 2, name: 'Ravi', is_placeholder: false },
  group: { id: 7, name: 'Goa' },
  expense_id: 5,
  created_at: 0,
  read: false,
  can_restore: false,
};
const dinner: ExpenseSnapshot = {
  id: 5,
  description: 'Dinner',
  amount_paise: 120000,
  paid_by_user_id: 1,
  split_type: 'equal',
  expense_date: '2026-10-01',
  shares: [
    { user_id: 1, owed_paise: 40000 },
    { user_id: 2, owed_paise: 40000 },
    { user_id: 3, owed_paise: 40000 },
  ],
};

describe('describeActivity', () => {
  it('expense created, with my impact (I paid → I get back)', () => {
    const item: ActivityItem = { ...base, type: 'expense_created', payload: { expense: dinner } };
    expect(text(item)).toBe('Ravi added Dinner in Goa');
    expect(describeActivity(item, people, ME).impact).toBe(80000);
    // From Chitra's side she owes her share.
    expect(describeActivity(item, people, 3).impact).toBe(-40000);
    // Dev isn't involved.
    expect(describeActivity(item, people, 4).impact).toBeNull();
  });

  it('says "You" when I am the actor', () => {
    const item: ActivityItem = {
      ...base,
      actor: { id: 1, name: 'Asha', is_placeholder: false },
      type: 'expense_created',
      payload: { expense: dinner },
    };
    expect(text(item)).toBe('You added Dinner in Goa');
  });

  it('expense updated lists the changes and uses the new impact', () => {
    const after: ExpenseSnapshot = {
      ...dinner,
      amount_paise: 150000,
      paid_by_user_id: 2,
      shares: [
        { user_id: 1, owed_paise: 75000 },
        { user_id: 2, owed_paise: 75000 },
      ],
    };
    const item: ActivityItem = {
      ...base,
      type: 'expense_updated',
      payload: { before: dinner, after },
    };
    const d = describeActivity(item, people, ME);
    expect(text(item)).toBe('Ravi updated Dinner in Goa');
    expect(d.changes).toEqual([
      'amount ₹1,200.00 → ₹1,500.00',
      'paid by You → Ravi',
      'removed Chitra',
    ]);
    expect(d.impact).toBe(-75000);
  });

  it('deleted expenses show what the impact was', () => {
    const item: ActivityItem = { ...base, type: 'expense_deleted', payload: { before: dinner } };
    const d = describeActivity(item, people, ME);
    expect(text(item)).toBe('Ravi deleted Dinner in Goa');
    expect(d).toMatchObject({ impact: 80000, impactIsPast: true });
  });

  it.each([
    [
      { type: 'friend_added', payload: { friend: { id: 1, name: 'Asha' } } },
      'Ravi added you as a friend',
    ],
    [
      { type: 'friend_added', payload: { friend: { id: 4, name: 'Dev' } } },
      'Ravi added Dev as a friend',
    ],
    [
      { type: 'group_created', payload: { group: { id: 7, name: 'Goa' }, member_ids: [1, 2] } },
      'Ravi created Goa',
    ],
    [
      { type: 'member_added', payload: { member: { id: 1, name: 'Asha' } } },
      'Ravi added you to Goa',
    ],
    [
      { type: 'member_added', payload: { member: { id: 4, name: 'Dev' } } },
      'Ravi added Dev to Goa',
    ],
    [{ type: 'member_left', payload: { member: { id: 4, name: 'Dev' } } }, 'Dev left Goa'],
    [
      {
        type: 'group_settings_changed',
        payload: { before: { name: 'Goa' }, after: { name: 'Goa 2026' } },
      },
      'Ravi renamed Goa → Goa 2026',
    ],
  ] as const)('%j reads "%s"', (variant, expected) => {
    expect(text({ ...base, ...variant } as ActivityItem)).toBe(expected);
  });
});

describe('diffExpense', () => {
  const name = (id: number) => (id === ME ? 'You' : people[String(id) as '2']);

  it('reports name, split type, date and added people', () => {
    const after: ExpenseSnapshot = {
      ...dinner,
      description: 'Beach dinner',
      split_type: 'percent',
      expense_date: '2026-10-02',
      shares: [...dinner.shares, { user_id: 4, owed_paise: 0 }],
    };
    expect(diffExpense(dinner, after, name)).toEqual([
      'name “Dinner” → “Beach dinner”',
      'split equally → by percentages',
      'added Dev',
      // Built with the same helper so the test doesn't break when the year changes.
      `date ${formatShortDate('2026-10-01')} → ${formatShortDate('2026-10-02')}`,
    ]);
  });

  it('falls back to "shares changed" when only the amounts per person moved', () => {
    const after: ExpenseSnapshot = {
      ...dinner,
      shares: [
        { user_id: 1, owed_paise: 20000 },
        { user_id: 2, owed_paise: 50000 },
        { user_id: 3, owed_paise: 50000 },
      ],
    };
    expect(diffExpense(dinner, after, name)).toEqual(['shares changed']);
  });
});
