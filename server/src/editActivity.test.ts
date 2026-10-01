import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import {
  ActivityPageSchema,
  ApiErrorSchema,
  ExpensePageSchema,
  ExpenseResponseSchema,
  FriendsResponseSchema,
  GroupBalancesResponseSchema,
  UnreadCountResponseSchema,
} from '@split-wise/shared';
import { createApp } from './app.js';
import { createDb, type Db } from './db/client.js';
import { expenseShares, expenses } from './db/schema.js';

const RELAXED = { authPerMinute: 10_000, apiPerMinute: 10_000 };
const TODAY = '2026-10-01';

let db: Db;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  db = createDb(':memory:');
  app = createApp({ db, rateLimits: RELAXED, logRequests: false });
});

function client() {
  const agent = request.agent(app);
  const write = (method: 'post' | 'put' | 'delete', path: string, body?: object) =>
    agent[method](`/api/v1${path}`).set('X-Requested-With', 'fetch').send(body);
  return {
    get: (path: string) => agent.get(`/api/v1${path}`),
    post: (path: string, body?: object) => write('post', path, body),
    put: (path: string, body: object) => write('put', path, body),
    del: (path: string) => write('delete', path),
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

/** Asha, Ravi, Chitra in "Goa"; Asha pays ₹12.00 for all three (400 each). */
async function setup() {
  const asha = await signUp('Asha');
  const ravi = await signUp('Ravi');
  const chitra = await signUp('Chitra');
  const groupId = (
    await asha.post('/groups', {
      name: 'Goa',
      new_members: [
        { name: 'R', email: 'ravi@example.com' },
        { name: 'C', email: 'chitra@example.com' },
      ],
    })
  ).body.group.id as number;
  const all = [asha.id, ravi.id, chitra.id].map((user_id) => ({ user_id }));
  const res = await asha.post('/expenses', {
    group_id: groupId,
    description: 'Dinner',
    amount_paise: 1200,
    paid_by_user_id: asha.id,
    split_type: 'equal',
    participants: all,
    expense_date: TODAY,
  });
  expect(res.status).toBe(201);
  return { asha, ravi, chitra, groupId, all, expenseId: res.body.expense.id as number };
}

const editBody = (over: object = {}) => ({
  description: 'Dinner',
  amount_paise: 1200,
  paid_by_user_id: 1,
  split_type: 'equal',
  participants: [{ user_id: 1 }, { user_id: 2 }, { user_id: 3 }],
  expense_date: TODAY,
  version: 1,
  ...over,
});
const nets = async (c: Client, groupId: number) =>
  Object.fromEntries(
    GroupBalancesResponseSchema.parse(
      (await c.get(`/groups/${groupId}/balances`)).body,
    ).members.map((m) => [m.user.id, m.net_paise]),
  );
const friendBalances = async (c: Client) =>
  Object.fromEntries(
    FriendsResponseSchema.parse((await c.get('/friends')).body).friends.map((f) => [
      f.id,
      f.balance_paise,
    ]),
  );
const feed = async (c: Client, query = '') =>
  ActivityPageSchema.parse((await c.get(`/activity${query}`)).body);

describe('DoD: editing an amount', () => {
  it('updates balances everywhere and shows before→after to everyone, including removed people', async () => {
    const { asha, ravi, chitra, groupId, expenseId } = await setup();
    expect(await nets(asha, groupId)).toEqual({ 1: 800, 2: -400, 3: -400 });

    // Ravi edits: ₹15.00, and Chitra is removed from the split.
    const res = await ravi.put(
      `/expenses/${expenseId}`,
      editBody({ amount_paise: 1500, participants: [{ user_id: asha.id }, { user_id: ravi.id }] }),
    );
    expect(res.status).toBe(200);
    const { expense } = ExpenseResponseSchema.parse(res.body);
    expect(expense.version).toBe(2);
    expect(expense.shares.map((s) => [s.user.id, s.owed_paise])).toEqual([
      [asha.id, 750],
      [ravi.id, 750],
    ]);

    // Balances everywhere.
    expect(await nets(chitra, groupId)).toEqual({ 1: 750, 2: -750, 3: 0 });
    expect(await friendBalances(asha)).toEqual({ [ravi.id]: 750, [chitra.id]: 0 });
    expect((await chitra.get('/balances/summary')).body).toEqual({
      owe_paise: 0,
      owed_paise: 0,
      net_paise: 0,
    });

    // The before→after item reaches all three — Chitra too, though she's no longer in the split.
    for (const who of [asha, ravi, chitra]) {
      const [latest] = (await feed(who)).items;
      expect(latest).toMatchObject({
        type: 'expense_updated',
        actor: { id: ravi.id },
        expense_id: expenseId,
      });
      if (latest?.type !== 'expense_updated') throw new Error('expected an update');
      expect(latest.payload.before.amount_paise).toBe(1200);
      expect(latest.payload.after.amount_paise).toBe(1500);
      expect(latest.payload.after.shares.map((s) => s.user_id)).toEqual([asha.id, ravi.id]);
    }
  });

  it('removed participants of a non-group expense still get the update', async () => {
    const asha = await signUp('Asha');
    const ravi = await signUp('Ravi');
    const chitra = await signUp('Chitra');
    await asha.post('/friends', { name: 'R', email: 'ravi@example.com' });
    await asha.post('/friends', { name: 'C', email: 'chitra@example.com' });
    const id = (
      await asha.post('/expenses', {
        description: 'Cab',
        amount_paise: 900,
        paid_by_user_id: asha.id,
        split_type: 'equal',
        participants: [asha.id, ravi.id, chitra.id].map((user_id) => ({ user_id })),
        expense_date: TODAY,
      })
    ).body.expense.id;
    await asha.put(
      `/expenses/${id}`,
      editBody({ amount_paise: 900, participants: [{ user_id: asha.id }, { user_id: ravi.id }] }),
    );
    expect((await feed(chitra)).items[0]?.type).toBe('expense_updated');
    // …but she can no longer open it, since she isn't involved any more.
    expect((await chitra.get(`/expenses/${id}`)).status).toBe(404);
  });
});

describe('DoD: delete then restore returns balances to where they were', () => {
  it('round-trips exactly', async () => {
    const { asha, ravi, chitra, groupId, expenseId, all } = await setup();
    // A second expense so the balances aren't trivially zero after deleting.
    await ravi.post('/expenses', {
      group_id: groupId,
      description: 'Fuel',
      amount_paise: 1001,
      paid_by_user_id: chitra.id,
      split_type: 'equal',
      participants: all,
      expense_date: TODAY,
    });
    const before = {
      nets: await nets(asha, groupId),
      friends: await friendBalances(asha),
      summary: (await ravi.get('/balances/summary')).body,
    };

    expect((await chitra.del(`/expenses/${expenseId}`)).status).toBe(204);
    expect(await nets(asha, groupId)).not.toEqual(before.nets);
    expect((await asha.get(`/expenses/${expenseId}`)).status).toBe(404);
    const list = ExpensePageSchema.parse((await asha.get(`/groups/${groupId}/expenses`)).body);
    expect(list.expenses.map((e) => (e.kind === 'expense' ? e.description : e.kind))).toEqual([
      'Fuel',
    ]);

    const restored = await ravi.post(`/expenses/${expenseId}/restore`);
    expect(restored.status).toBe(200);
    expect(await nets(asha, groupId)).toEqual(before.nets);
    expect(await friendBalances(asha)).toEqual(before.friends);
    expect((await ravi.get('/balances/summary')).body).toEqual(before.summary);

    const types = (await feed(asha)).items.map((i) => i.type);
    expect(types.slice(0, 2)).toEqual(['expense_restored', 'expense_deleted']);
  });

  it('offers Restore in the feed only while deleted and permitted', async () => {
    const { asha, chitra, expenseId } = await setup();
    await asha.del(`/expenses/${expenseId}`);
    const deleted = (await feed(chitra)).items.find((i) => i.type === 'expense_deleted')!;
    expect(deleted.can_restore).toBe(true);
    await chitra.post(`/expenses/${expenseId}/restore`);
    const again = (await feed(chitra)).items.find((i) => i.type === 'expense_deleted')!;
    expect(again.can_restore).toBe(false);
    expect((await chitra.post(`/expenses/${expenseId}/restore`)).status).toBe(409); // not deleted
  });

  it('refuses to restore when someone in the expense has left the group', async () => {
    const { asha, ravi, chitra, groupId } = await setup();
    const dev = await signUp('Dev');
    await asha.post(`/groups/${groupId}/members`, { name: 'Dev', email: 'dev@example.com' });
    const id = (
      await asha.post('/expenses', {
        group_id: groupId,
        description: 'Snacks',
        amount_paise: 200,
        paid_by_user_id: asha.id,
        split_type: 'equal',
        participants: [{ user_id: dev.id }],
        expense_date: TODAY,
      })
    ).body.expense.id;
    await asha.del(`/expenses/${id}`); // Dev's only debt is gone…
    expect((await dev.del(`/groups/${groupId}/members/me`)).status).toBe(204); // …so he can leave.
    const res = await asha.post(`/expenses/${id}/restore`);
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/Dev has left/);
    expect(
      (await feed(ravi)).items.find((i) => i.type === 'expense_deleted' && i.expense_id === id)
        ?.can_restore,
    ).toBe(false);
    void chitra;
  });
});

describe('editing rules', () => {
  it('rejects a stale version with 409 naming who changed it, and writes nothing', async () => {
    const { asha, ravi, expenseId } = await setup();
    expect(
      (await ravi.put(`/expenses/${expenseId}`, editBody({ amount_paise: 1500 }))).status,
    ).toBe(200);
    const stale = await asha.put(
      `/expenses/${expenseId}`,
      editBody({ amount_paise: 3000, version: 1 }),
    );
    expect(stale.status).toBe(409);
    const error = ApiErrorSchema.parse(stale.body).error;
    expect(error.message).toMatch(/changed by Ravi/);
    expect(error.details).toEqual({ version: 2 });
    expect(db.select().from(expenses).where(eq(expenses.id, expenseId)).get()!.amountPaise).toBe(
      1500,
    );
  });

  it('a rejected split changes nothing (version, shares, feed)', async () => {
    const { ravi, expenseId } = await setup();
    const res = await ravi.put(
      `/expenses/${expenseId}`,
      editBody({
        split_type: 'exact',
        participants: [
          { user_id: 1, value: 500 },
          { user_id: 2, value: 500 },
        ],
      }),
    );
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('SPLIT_SUM_MISMATCH');
    expect(db.select().from(expenses).where(eq(expenses.id, expenseId)).get()!.version).toBe(1);
    expect(
      db.select().from(expenseShares).where(eq(expenseShares.expenseId, expenseId)).all(),
    ).toHaveLength(3);
    expect((await feed(ravi)).items.some((i) => i.type === 'expense_updated')).toBe(false);
  });

  it('cannot move an expense to another group (group_id is not accepted)', async () => {
    const { asha, expenseId } = await setup();
    const res = await asha.put(`/expenses/${expenseId}`, { ...editBody(), group_id: null });
    expect(res.status).toBe(400);
  });

  it('only involved people / current members may edit or delete; others get 404', async () => {
    const { expenseId } = await setup();
    const outsider = await signUp('Dev');
    expect((await outsider.put(`/expenses/${expenseId}`, editBody())).status).toBe(404);
    expect((await outsider.del(`/expenses/${expenseId}`)).status).toBe(404);
    expect((await outsider.post(`/expenses/${expenseId}/restore`)).status).toBe(404);
  });

  it('non-group: a participant may edit and keep people who aren’t their friend; new people must be', async () => {
    const asha = await signUp('Asha');
    const ravi = await signUp('Ravi');
    const chitra = await signUp('Chitra');
    const dev = await signUp('Dev');
    await asha.post('/friends', { name: 'R', email: 'ravi@example.com' });
    await asha.post('/friends', { name: 'C', email: 'chitra@example.com' });
    const id = (
      await asha.post('/expenses', {
        description: 'Cab',
        amount_paise: 900,
        paid_by_user_id: asha.id,
        split_type: 'equal',
        participants: [asha.id, ravi.id, chitra.id].map((user_id) => ({ user_id })),
        expense_date: TODAY,
      })
    ).body.expense.id;
    // Ravi isn't Chitra's friend, but she's already on it.
    const keep = await ravi.put(
      `/expenses/${id}`,
      editBody({
        amount_paise: 990,
        participants: [asha.id, ravi.id, chitra.id].map((user_id) => ({ user_id })),
      }),
    );
    expect(keep.status).toBe(200);
    // Adding Dev (not Ravi's friend) is refused.
    const addStranger = await ravi.put(
      `/expenses/${id}`,
      editBody({
        version: 2,
        participants: [asha.id, ravi.id, dev.id].map((user_id) => ({ user_id })),
      }),
    );
    expect(addStranger.status).toBe(400);
  });

  it('deleting twice is a 404', async () => {
    const { asha, expenseId } = await setup();
    expect((await asha.del(`/expenses/${expenseId}`)).status).toBe(204);
    expect((await asha.del(`/expenses/${expenseId}`)).status).toBe(404);
    expect((await asha.put(`/expenses/${expenseId}`, editBody())).status).toBe(404);
  });
});

describe('activity feed', () => {
  it('lists only my items, newest first, with names and cursor pagination', async () => {
    const { asha, ravi, groupId } = await setup();
    const outsider = await signUp('Dev');
    const all = await feed(asha);
    expect(all.items.map((i) => i.type)).toEqual(['expense_created', 'group_created']);
    expect(all.items[0]).toMatchObject({
      actor: { name: 'Asha' },
      group: { id: groupId, name: 'Goa' },
      read: true, // Asha's own action
    });
    expect((await feed(ravi)).items[0]!.read).toBe(false); // new to Ravi
    expect(all.people).toMatchObject({ '1': 'Asha', '2': 'Ravi', '3': 'Chitra' });

    const first = await feed(asha, '?limit=1');
    expect(first.items).toHaveLength(1);
    const second = await feed(asha, `?limit=1&before=${first.next_cursor}`);
    expect(second.items[0]!.type).toBe('group_created');
    expect(second.next_cursor).toBeNull();

    expect((await feed(outsider)).items).toEqual([]);
    expect((await ravi.get('/activity?limit=500')).status).toBe(400);
  });

  it('filters to one expense’s history', async () => {
    const { asha, ravi, expenseId } = await setup();
    await ravi.put(`/expenses/${expenseId}`, editBody({ description: 'Big dinner' }));
    const history = await feed(asha, `?expense_id=${expenseId}`);
    expect(history.items.map((i) => i.type)).toEqual(['expense_updated', 'expense_created']);
  });

  it('unread count drops to 0 after marking read', async () => {
    const { ravi } = await setup(); // Asha created the group and the expense
    const count = async () =>
      UnreadCountResponseSchema.parse((await ravi.get('/activity/unread-count')).body).count;
    expect(await count()).toBe(2);
    expect((await ravi.post('/activity/read')).status).toBe(204);
    expect(await count()).toBe(0);
    expect((await feed(ravi)).items.every((i) => i.read)).toBe(true);
  });

  it('your own actions show in your feed but never as unread', async () => {
    const { asha, ravi, expenseId } = await setup();
    const unread = async (c: Client) =>
      UnreadCountResponseSchema.parse((await c.get('/activity/unread-count')).body).count;
    expect(await unread(asha)).toBe(0);
    await asha.del(`/expenses/${expenseId}`);
    expect(await unread(asha)).toBe(0);
    expect((await feed(asha)).items[0]).toMatchObject({ type: 'expense_deleted', read: true });
    expect(await unread(ravi)).toBe(3); // group_created, expense_created, expense_deleted
  });

  it('a claimed placeholder inherits their feed', async () => {
    const asha = await signUp('Asha');
    await asha.post('/friends', { name: 'Bina', email: 'bina@example.com' });
    const bina = client();
    await bina.post('/auth/signup', {
      name: 'Bina',
      email: 'bina@example.com',
      password: 'long enough',
    });
    const page = ActivityPageSchema.parse((await bina.get('/activity')).body);
    expect(page.items.map((i) => i.type)).toEqual(['friend_added']);
  });
});
