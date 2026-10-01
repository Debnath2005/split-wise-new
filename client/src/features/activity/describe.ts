/**
 * Turns an activity item into a human sentence (SPEC §9 "Feed UI"), e.g.
 * "Asha updated Dinner in Goa: amount ₹1,200.00 → ₹1,500.00". Pure, so it's unit-tested.
 * All money is formatted from integer paise by the shared helpers.
 */
import {
  expenseImpact,
  formatPaise,
  type ActivityItem,
  type ExpenseSnapshot,
  type SettlementSnapshot,
  type SplitType,
} from '@split-wise/shared';
import { formatShortDate } from '../../lib/dates';

/** A run of sentence text; `strong` for people/groups, `em` for expense names. */
export interface Segment {
  text: string;
  strong?: boolean;
  em?: boolean;
}

export interface Described {
  sentence: Segment[];
  /** Field-level changes for updates, e.g. ["amount ₹12.00 → ₹15.00"]. */
  changes: string[];
  /** Viewer's impact for expense items (positive = gets back), null when not involved. */
  impact: number | null;
  /** True for deleted expenses: the impact is what it *was*. */
  impactIsPast: boolean;
}

const SPLIT_WORDS: Record<SplitType, string> = {
  equal: 'equally',
  exact: 'by exact amounts',
  percent: 'by percentages',
};

export function describeActivity(
  item: ActivityItem,
  people: Record<string, string>,
  meId: number,
): Described {
  const name = (id: number) => (id === meId ? 'You' : (people[String(id)] ?? 'Someone'));
  const nameLower = (id: number) => (id === meId ? 'you' : name(id));
  const actor: Segment = { text: item.actor.id === meId ? 'You' : item.actor.name, strong: true };
  const groupName: Segment = { text: item.group?.name ?? 'a group', strong: true };
  const inGroup: Segment[] = item.group ? [{ text: ' in ' }, groupName] : [];
  const none = { changes: [], impact: null, impactIsPast: false };

  const impactOf = (e: ExpenseSnapshot): number | null => {
    const mine = e.shares.find((s) => s.user_id === meId)?.owed_paise ?? 0;
    const involved = e.paid_by_user_id === meId || e.shares.some((s) => s.user_id === meId);
    return involved
      ? expenseImpact(
          { amountPaise: e.amount_paise, paidByUserId: e.paid_by_user_id, mySharePaise: mine },
          meId,
        )
      : null;
  };

  /** "Chitra paid Asha ₹9.66 via UPI in Goa". Settlements aren't "you get back / you owe". */
  const paymentLine = (p: SettlementSnapshot): Segment[] => [
    { text: name(p.from_user_id), strong: true },
    { text: ' paid ' },
    { text: nameLower(p.to_user_id), strong: true },
    {
      text: ` ${formatPaise(p.amount_paise)}${p.method === 'upi' ? ' via UPI' : p.method === 'cash' ? ' in cash' : ''}`,
    },
    ...inGroup,
  ];

  const expenseLine = (verb: string, e: ExpenseSnapshot): Segment[] => [
    actor,
    { text: ` ${verb} ` },
    { text: e.description, em: true },
    ...inGroup,
  ];

  switch (item.type) {
    case 'expense_created':
      return {
        ...none,
        sentence: expenseLine('added', item.payload.expense),
        impact: impactOf(item.payload.expense),
      };
    case 'expense_restored':
      return {
        ...none,
        sentence: expenseLine('restored', item.payload.expense),
        impact: impactOf(item.payload.expense),
      };
    case 'expense_deleted':
      return {
        ...none,
        sentence: expenseLine('deleted', item.payload.before),
        impact: impactOf(item.payload.before),
        impactIsPast: true,
      };
    case 'expense_updated': {
      const { before, after } = item.payload;
      return {
        sentence: expenseLine('updated', after),
        changes: diffExpense(before, after, name),
        impact: impactOf(after),
        impactIsPast: false,
      };
    }
    case 'friend_added': {
      const friendId = item.payload.friend.id;
      return {
        ...none,
        sentence:
          friendId === meId
            ? [actor, { text: ' added you as a friend' }]
            : [
                actor,
                { text: ' added ' },
                { text: name(friendId), strong: true },
                { text: ' as a friend' },
              ],
      };
    }
    case 'group_created':
      return {
        ...none,
        sentence: [actor, { text: ' created ' }, { text: item.payload.group.name, strong: true }],
      };
    case 'member_added':
      return {
        ...none,
        sentence: [
          actor,
          { text: ' added ' },
          { text: nameLower(item.payload.member.id), strong: true },
          { text: ' to ' },
          groupName,
        ],
      };
    case 'member_left':
      return {
        ...none,
        sentence: [
          { text: name(item.payload.member.id), strong: true },
          { text: ' left ' },
          groupName,
        ],
      };
    case 'group_settings_changed':
      return {
        ...none,
        sentence: [
          actor,
          { text: ' renamed ' },
          { text: item.payload.before.name, strong: true },
          { text: ' → ' },
          { text: item.payload.after.name, strong: true },
        ],
      };
    case 'settlement_created':
      return { ...none, sentence: paymentLine(item.payload.settlement) };
    case 'settlement_deleted':
      return {
        ...none,
        sentence: [actor, { text: ' deleted a payment: ' }, ...paymentLine(item.payload.before)],
      };
  }
}

/** What changed between two snapshots, in reading order. */
export function diffExpense(
  before: ExpenseSnapshot,
  after: ExpenseSnapshot,
  name: (id: number) => string,
): string[] {
  const changes: string[] = [];
  if (before.description !== after.description)
    changes.push(`name “${before.description}” → “${after.description}”`);
  if (before.amount_paise !== after.amount_paise) {
    changes.push(`amount ${formatPaise(before.amount_paise)} → ${formatPaise(after.amount_paise)}`);
  }
  if (before.paid_by_user_id !== after.paid_by_user_id) {
    changes.push(`paid by ${name(before.paid_by_user_id)} → ${name(after.paid_by_user_id)}`);
  }
  if (before.split_type !== after.split_type) {
    changes.push(`split ${SPLIT_WORDS[before.split_type]} → ${SPLIT_WORDS[after.split_type]}`);
  }
  const was = new Set(before.shares.map((s) => s.user_id));
  const now = new Set(after.shares.map((s) => s.user_id));
  const added = [...now].filter((id) => !was.has(id));
  const removed = [...was].filter((id) => !now.has(id));
  if (added.length) changes.push(`added ${added.map(name).join(', ')}`);
  if (removed.length) changes.push(`removed ${removed.map(name).join(', ')}`);
  if (before.expense_date !== after.expense_date) {
    changes.push(
      `date ${formatShortDate(before.expense_date)} → ${formatShortDate(after.expense_date)}`,
    );
  }
  const sharesChanged = after.shares.some(
    (s) => before.shares.find((b) => b.user_id === s.user_id)?.owed_paise !== s.owed_paise,
  );
  if (changes.length === 0 && sharesChanged) changes.push('shares changed');
  return changes;
}
