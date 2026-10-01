import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { eq, sql } from 'drizzle-orm';
import fc from 'fast-check';
import {
  ApiErrorSchema,
  ExpensePageSchema,
  ExpenseResponseSchema,
  expenseImpact,
} from '@split-wise/shared';
import { createApp } from './app.js';
import { createDb, type Db } from './db/client.js';
import { activities, activityRecipients, expenseShares, expenses } from './db/schema.js';

const RELAXED = { authPerMinute: 10_000, apiPerMinute: 10_000 };

let db: Db;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  db = createDb(':memory:');
  app = createApp({ db, rateLimits: RELAXED, logRequests: false });
});

function client() {
  const agent = request.agent(app);
  return {
    get: (path: string) => agent.get(`/api/v1${path}`),
    post: (path: string, body?: object) =>
      agent.post(`/api/v1${path}`).set('X-Requested-With', 'fetch').send(body),
  };
}
type Client = ReturnType<typeof client> & { id: number };

async function signUp(name: string): Promise<Client> {
  const c = client();
  const res = await c.post('/auth/signup', {
    name,
    email: `${name.toLowerCase()}@example.com`,
    password: 'long enough',
  });
  expect(res.status).toBe(201);
  return Object.assign(c, { id: res.body.user.id as number });
}

/** Asha, Ravi and Chitra in one group (all befriended through it). */
async function trio() {
  const asha = await signUp('Asha');
  const ravi = await signUp('Ravi');
  const chitra = await signUp('Chitra');
  const res = await asha.post('/groups', {
    name: 'Goa',
    new_members: [
      { name: 'Ravi', email: 'ravi@example.com' },
      { name: 'Chitra', email: 'chitra@example.com' },
    ],
  });
  return { asha, ravi, chitra, groupId: res.body.group.id as number };
}

const TODAY = '2026-10-01';
const errorOf = (body: unknown) => ApiErrorSchema.parse(body).error;
const owed = (body: unknown) =>
  ExpenseResponseSchema.parse(body).expense.shares.map((s) => [s.user.id, s.owed_paise]);

describe('POST /expenses — split types', () => {
  it('equal: ₹100 among 3 gives the extra paisa to the lowest user id', async () => {
    const { asha, ravi, chitra, groupId } = await trio();
    const res = await asha.post('/expenses', {
      group_id: groupId,
      description: '  Dinner ',
      amount_paise: 10000,
      paid_by_user_id: ravi.id,
      split_type: 'equal',
      participants: [{ user_id: chitra.id }, { user_id: asha.id }, { user_id: ravi.id }],
      expense_date: TODAY,
    });
    expect(res.status).toBe(201);
    const { expense } = ExpenseResponseSchema.parse(res.body);
    expect(expense).toMatchObject({
      description: 'Dinner',
      amount_paise: 10000,
      currency: 'INR',
      split_type: 'equal',
      paid_by: { id: ravi.id, name: 'Ravi' },
      created_by: { id: asha.id },
      group: { id: groupId, name: 'Goa' },
      version: 1,
      notes: null,
    });
    expect(owed(res.body)).toEqual([
      [asha.id, 3334],
      [ravi.id, 3333],
      [chitra.id, 3333],
    ]);
    expect(expense.shares.every((s) => s.input_value === null)).toBe(true);
  });

  it('exact: stores each entered share (including a zero) as owed and as input', async () => {
    const { asha, ravi, chitra, groupId } = await trio();
    const res = await asha.post('/expenses', {
      group_id: groupId,
      description: 'Tickets',
      amount_paise: 50000,
      paid_by_user_id: asha.id,
      split_type: 'exact',
      participants: [
        { user_id: asha.id, value: 30000 },
        { user_id: ravi.id, value: 20000 },
        { user_id: chitra.id, value: 0 },
      ],
      expense_date: TODAY,
    });
    expect(res.status).toBe(201);
    expect(ExpenseResponseSchema.parse(res.body).expense.shares.map((s) => s.input_value)).toEqual([
      30000, 20000, 0,
    ]);
    expect(owed(res.body)).toEqual([
      [asha.id, 30000],
      [ravi.id, 20000],
      [chitra.id, 0],
    ]);
  });

  it('percent: ₹1.00 at 33.33/33.33/33.34% → 33/33/34, keeping basis points as input', async () => {
    const { asha, ravi, chitra, groupId } = await trio();
    const res = await asha.post('/expenses', {
      group_id: groupId,
      description: 'Chai',
      amount_paise: 100,
      paid_by_user_id: asha.id,
      split_type: 'percent',
      participants: [
        { user_id: asha.id, value: 3333 },
        { user_id: ravi.id, value: 3333 },
        { user_id: chitra.id, value: 3334 },
      ],
      expense_date: TODAY,
    });
    expect(res.status).toBe(201);
    expect(owed(res.body)).toEqual([
      [asha.id, 33],
      [ravi.id, 33],
      [chitra.id, 34],
    ]);
    expect(ExpenseResponseSchema.parse(res.body).expense.shares.map((s) => s.input_value)).toEqual([
      3333, 3333, 3334,
    ]);
  });

  it('allows a payer who is not a participant', async () => {
    const { asha, ravi, groupId } = await trio();
    const res = await asha.post('/expenses', {
      group_id: groupId,
      description: "Ravi's dinner",
      amount_paise: 25000,
      paid_by_user_id: asha.id,
      split_type: 'equal',
      participants: [{ user_id: ravi.id }],
      expense_date: TODAY,
    });
    expect(res.status).toBe(201);
    expect(owed(res.body)).toEqual([[ravi.id, 25000]]);
  });
});

describe('POST /expenses — rejected splits write nothing', () => {
  it.each([
    ['exact under', 'exact', [30000, 10000], 10000],
    ['exact over', 'exact', [30000, 30000], -10000],
    ['percent under', 'percent', [5000, 4000], 1000],
  ] as const)('%s → SPLIT_SUM_MISMATCH', async (_case, splitType, values, remaining) => {
    const { asha, ravi, groupId } = await trio();
    const res = await asha.post('/expenses', {
      group_id: groupId,
      description: 'X',
      amount_paise: 50000,
      paid_by_user_id: asha.id,
      split_type: splitType,
      participants: [
        { user_id: asha.id, value: values[0] },
        { user_id: ravi.id, value: values[1] },
      ],
      expense_date: TODAY,
    });
    expect(res.status).toBe(400);
    const error = errorOf(res.body);
    expect(error.code).toBe('SPLIT_SUM_MISMATCH');
    expect(error.details).toMatchObject({ remaining });
    expect(db.select().from(expenses).all()).toHaveLength(0);
    expect(db.select().from(expenseShares).all()).toHaveLength(0);
  });

  it.each([
    ['client-computed shares', { participants: [{ user_id: 1, owed_paise: 100 }] }],
    ['duplicate participants', { participants: [{ user_id: 1 }, { user_id: 1 }] }],
    ['no participants', { participants: [] }],
    ['an invalid date', { expense_date: '2026-02-30' }],
    ['a fractional amount', { amount_paise: 100.5 }],
    ['an amount over ₹10 lakh', { amount_paise: 100_000_001 }],
    ['a blank description', { description: '   ' }],
    ['unknown fields', { shares: [] }],
  ])('rejects %s', async (_case, override) => {
    const { asha, groupId } = await trio();
    const res = await asha.post('/expenses', {
      group_id: groupId,
      description: 'X',
      amount_paise: 1000,
      paid_by_user_id: asha.id,
      split_type: 'equal',
      participants: [{ user_id: asha.id }],
      expense_date: TODAY,
      ...override,
    });
    expect(res.status).toBe(400);
    expect(db.select().from(expenses).all()).toHaveLength(0);
  });
});

describe('POST /expenses — who can be involved', () => {
  it('group: non-members get 404; payer and participants must be members', async () => {
    const { asha, ravi, groupId } = await trio();
    const outsider = await signUp('Dev');
    const base = {
      group_id: groupId,
      description: 'X',
      amount_paise: 1000,
      split_type: 'equal',
      expense_date: TODAY,
    };
    const asOutsider = await outsider.post('/expenses', {
      ...base,
      paid_by_user_id: outsider.id,
      participants: [{ user_id: outsider.id }],
    });
    expect(asOutsider.status).toBe(404);

    const outsiderPays = await asha.post('/expenses', {
      ...base,
      paid_by_user_id: outsider.id,
      participants: [{ user_id: asha.id }],
    });
    expect(outsiderPays.status).toBe(400);

    const outsiderShares = await asha.post('/expenses', {
      ...base,
      paid_by_user_id: ravi.id,
      participants: [{ user_id: asha.id }, { user_id: outsider.id }],
    });
    expect(outsiderShares.status).toBe(400);
  });

  it('non-group: works between friends, including a placeholder', async () => {
    const asha = await signUp('Asha');
    const placeholder = (await asha.post('/friends', { name: 'Bina', email: 'bina@example.com' }))
      .body.friend;
    const res = await asha.post('/expenses', {
      description: 'Auto',
      amount_paise: 300,
      paid_by_user_id: placeholder.id,
      split_type: 'equal',
      participants: [{ user_id: asha.id }, { user_id: placeholder.id }],
      expense_date: TODAY,
    });
    expect(res.status).toBe(201);
    expect(ExpenseResponseSchema.parse(res.body).expense.group).toBeNull();
  });

  it('non-group: you must be involved, and everyone else must be your friend', async () => {
    const asha = await signUp('Asha');
    const ravi = await signUp('Ravi');
    const stranger = await signUp('Dev');
    await asha.post('/friends', { name: 'Ravi', email: 'ravi@example.com' });
    const base = { description: 'X', amount_paise: 1000, split_type: 'equal', expense_date: TODAY };

    const notInvolved = await asha.post('/expenses', {
      ...base,
      paid_by_user_id: ravi.id,
      participants: [{ user_id: ravi.id }],
    });
    expect(notInvolved.status).toBe(400);

    const withStranger = await asha.post('/expenses', {
      ...base,
      paid_by_user_id: asha.id,
      participants: [{ user_id: asha.id }, { user_id: stranger.id }],
    });
    expect(withStranger.status).toBe(400);
  });
});

describe('GET /expenses/:id', () => {
  it('is visible to group members only', async () => {
    const { asha, chitra, groupId } = await trio();
    const outsider = await signUp('Dev');
    const id = (
      await asha.post('/expenses', {
        group_id: groupId,
        description: 'X',
        amount_paise: 900,
        paid_by_user_id: asha.id,
        split_type: 'equal',
        participants: [{ user_id: asha.id }],
        expense_date: TODAY,
      })
    ).body.expense.id;
    // Chitra isn't in the split but is a member, so she can see it.
    expect((await chitra.get(`/expenses/${id}`)).status).toBe(200);
    expect((await outsider.get(`/expenses/${id}`)).status).toBe(404);
    expect((await asha.get('/expenses/999')).status).toBe(404);
  });

  it('non-group expenses are visible only to the payer and participants', async () => {
    const { asha, ravi, chitra } = await trio();
    const id = (
      await asha.post('/expenses', {
        description: 'Coffee',
        amount_paise: 400,
        paid_by_user_id: asha.id,
        split_type: 'equal',
        participants: [{ user_id: asha.id }, { user_id: ravi.id }],
        expense_date: TODAY,
      })
    ).body.expense.id;
    expect((await ravi.get(`/expenses/${id}`)).status).toBe(200);
    expect((await chitra.get(`/expenses/${id}`)).status).toBe(404);
  });
});

describe('activity (ADR-0011)', () => {
  it('logs expense_created with a snapshot for every group member, in the same transaction', async () => {
    const { asha, ravi, chitra, groupId } = await trio();
    const id = (
      await asha.post('/expenses', {
        group_id: groupId,
        description: 'Fuel',
        amount_paise: 1000,
        paid_by_user_id: asha.id,
        split_type: 'equal',
        participants: [{ user_id: asha.id }, { user_id: ravi.id }],
        expense_date: TODAY,
      })
    ).body.expense.id;
    const [activity] = db
      .select()
      .from(activities)
      .where(eq(activities.type, 'expense_created'))
      .all();
    expect(activity).toMatchObject({ expenseId: id, groupId, actorUserId: asha.id });
    expect(activity!.payload).toMatchObject({
      expense: { amount_paise: 1000, shares: [{ owed_paise: 500 }, { owed_paise: 500 }] },
    });
    const recipients = db
      .select({ userId: activityRecipients.userId })
      .from(activityRecipients)
      .where(eq(activityRecipients.activityId, activity!.id))
      .all()
      .map((r) => r.userId)
      .sort();
    expect(recipients).toEqual([asha.id, ravi.id, chitra.id].sort());
  });
});

describe('expense lists', () => {
  async function add(c: Client, body: object) {
    const res = await c.post('/expenses', {
      amount_paise: 1000,
      split_type: 'equal',
      expense_date: TODAY,
      ...body,
    });
    expect(res.status).toBe(201);
    return res.body.expense.id as number;
  }

  it('group list: newest date first, then newest id, with cursor pagination and my share', async () => {
    const { asha, ravi, groupId } = await trio();
    const both = [{ user_id: asha.id }, { user_id: ravi.id }];
    const a = await add(asha, {
      group_id: groupId,
      description: 'Old',
      paid_by_user_id: asha.id,
      participants: both,
      expense_date: '2026-09-01',
    });
    const b = await add(asha, {
      group_id: groupId,
      description: 'New 1',
      paid_by_user_id: ravi.id,
      participants: both,
    });
    const c = await add(asha, {
      group_id: groupId,
      description: 'New 2',
      paid_by_user_id: asha.id,
      participants: [{ user_id: ravi.id }],
    });

    const first = ExpensePageSchema.parse(
      (await asha.get(`/groups/${groupId}/expenses?limit=2`)).body,
    );
    expect(first.expenses.map((e) => e.id)).toEqual([c, b]);
    expect(first.next_cursor).toBe(`${TODAY}.e.${b}`);
    const second = ExpensePageSchema.parse(
      (await asha.get(`/groups/${groupId}/expenses?limit=2&before=${first.next_cursor}`)).body,
    );
    expect(second.expenses.map((e) => e.id)).toEqual([a]);
    expect(second.next_cursor).toBeNull();

    // Impact from Asha's point of view (SPEC §11): lent ₹10 on c, borrowed ₹5 on b.
    const impacts = first.expenses.map((e) =>
      e.kind === 'expense'
        ? expenseImpact(
            {
              amountPaise: e.amount_paise,
              paidByUserId: e.paid_by.id,
              mySharePaise: e.my_share_paise,
            },
            asha.id,
          )
        : null,
    );
    expect(impacts).toEqual([1000, -500]);
  });

  it('rejects malformed pagination parameters', async () => {
    const { asha, groupId } = await trio();
    expect((await asha.get(`/groups/${groupId}/expenses?before=nope`)).status).toBe(400);
    expect((await asha.get(`/groups/${groupId}/expenses?limit=500`)).status).toBe(400);
  });

  it('friend list: only expenses involving both of us, across groups and non-group', async () => {
    const { asha, ravi, chitra, groupId } = await trio();
    const withRavi = await add(asha, {
      group_id: groupId,
      description: 'G both',
      paid_by_user_id: ravi.id,
      participants: [{ user_id: asha.id }],
    });
    await add(asha, {
      group_id: groupId,
      description: 'G only Chitra',
      paid_by_user_id: asha.id,
      participants: [{ user_id: chitra.id }],
    });
    const nonGroup = await add(asha, {
      description: 'Coffee',
      paid_by_user_id: asha.id,
      participants: [{ user_id: ravi.id }],
    });

    const page = ExpensePageSchema.parse((await asha.get(`/friends/${ravi.id}/expenses`)).body);
    expect(page.expenses.map((e) => e.id)).toEqual([nonGroup, withRavi]);
    expect(page.expenses[0]!.group).toBeNull();
    expect(page.expenses[1]!.group).toEqual({ id: groupId, name: 'Goa' });

    const stranger = await signUp('Dev');
    expect((await asha.get(`/friends/${stranger.id}/expenses`)).status).toBe(404);
  });
});

describe('SPEC §4 invariant at the database level', () => {
  it('Σ owed_paise = amount_paise for every stored expense', async () => {
    const { asha, ravi, chitra, groupId } = await trio();
    const ids = [asha.id, ravi.id, chitra.id];
    const samples = fc.sample(
      fc.record({
        amount: fc.integer({ min: 1, max: 100_000_000 }),
        type: fc.constantFrom('equal', 'percent'),
        cut: fc.tuple(fc.integer({ min: 0, max: 10000 }), fc.integer({ min: 0, max: 10000 })),
      }),
      { numRuns: 40, seed: 42 },
    );
    for (const { amount, type, cut } of samples) {
      const [lo, hi] = [Math.min(...cut), Math.max(...cut)];
      const bps = [lo, hi - lo, 10000 - hi];
      const res = await asha.post('/expenses', {
        group_id: groupId,
        description: 'Random',
        amount_paise: amount,
        paid_by_user_id: asha.id,
        split_type: type,
        participants: ids.map((user_id, i) =>
          type === 'percent' ? { user_id, value: bps[i] } : { user_id },
        ),
        expense_date: TODAY,
      });
      expect(res.status).toBe(201);
    }
    const mismatched = db.all<{ id: number }>(sql`
      SELECT e.id FROM expenses e
      JOIN expense_shares s ON s.expense_id = e.id
      GROUP BY e.id HAVING SUM(s.owed_paise) <> e.amount_paise`);
    expect(mismatched).toEqual([]);
    expect(db.select().from(expenses).all()).toHaveLength(40);
  });
});
