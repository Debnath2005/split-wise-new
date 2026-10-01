import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import {
  BalanceSummaryResponseSchema,
  FriendDetailResponseSchema,
  FriendsResponseSchema,
  GroupBalancesResponseSchema,
  GroupsResponseSchema,
  ApiErrorSchema,
  ExpensePageSchema,
} from '@split-wise/shared';
import { createApp } from './app.js';
import { createDb, type Db } from './db/client.js';
import { activities, activityRecipients, expenses, friendships } from './db/schema.js';

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
  const write = (method: 'post' | 'delete', path: string, body?: object) =>
    agent[method](`/api/v1${path}`).set('X-Requested-With', 'fetch').send(body);
  return {
    get: (path: string) => agent.get(`/api/v1${path}`),
    post: (path: string, body?: object) => write('post', path, body),
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

async function addExpense(c: Client, body: object) {
  const res = await c.post('/expenses', { expense_date: TODAY, description: 'X', ...body });
  expect(res.status).toBe(201);
  return res.body.expense.id as number;
}

/**
 * The same hand-worked trip as shared/lib/money/balances.test.ts:
 * nets Asha +1766, Ravi +167, Chitra −1933.
 */
async function trip() {
  const asha = await signUp('Asha'); // id 1
  const ravi = await signUp('Ravi'); // id 2
  const chitra = await signUp('Chitra'); // id 3
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
  const e1 = await addExpense(asha, {
    group_id: groupId,
    amount_paise: 3000,
    paid_by_user_id: asha.id,
    split_type: 'equal',
    participants: all,
  });
  await addExpense(asha, {
    group_id: groupId,
    amount_paise: 1200,
    paid_by_user_id: ravi.id,
    split_type: 'exact',
    participants: [
      { user_id: asha.id, value: 200 },
      { user_id: chitra.id, value: 1000 },
    ],
  });
  await addExpense(asha, {
    group_id: groupId,
    amount_paise: 100,
    paid_by_user_id: chitra.id,
    split_type: 'equal',
    participants: all,
  });
  return { asha, ravi, chitra, groupId, e1 };
}

const nets = async (c: Client, groupId: number) =>
  Object.fromEntries(
    GroupBalancesResponseSchema.parse(
      (await c.get(`/groups/${groupId}/balances`)).body,
    ).members.map((m) => [m.user.id, m.net_paise]),
  );
const friendBalances = async (c: Client) =>
  Object.fromEntries(
    FriendsResponseSchema.parse((await c.get('/friends')).body).friends.map((f) => [
      f.name,
      f.balance_paise,
    ]),
  );
const errorCode = (body: unknown) => ApiErrorSchema.parse(body).error.code;

describe('balances match the hand calculation (DoD)', () => {
  it('group nets, Σ net = 0, and raw transfers', async () => {
    const { asha, ravi, chitra, groupId } = await trip();
    expect(await nets(asha, groupId)).toEqual({
      [asha.id]: 1766,
      [ravi.id]: 167,
      [chitra.id]: -1933,
    });

    const body = GroupBalancesResponseSchema.parse(
      (await chitra.get(`/groups/${groupId}/balances`)).body,
    );
    expect(body.members.reduce((sum, m) => sum + m.net_paise, 0)).toBe(0);
    expect(body.members.map((m) => m.user.name)).toEqual(['Asha', 'Ravi', 'Chitra']); // creditors first
    expect(body.simplified).toBe(false);
    expect(body.transfers.map((t) => [t.from.name, t.to.name, t.amount_paise])).toEqual([
      ['Ravi', 'Asha', 800],
      ['Chitra', 'Asha', 966],
      ['Chitra', 'Ravi', 967],
    ]);
  });

  it('friends list balances and dashboard summary for each person', async () => {
    const { asha, ravi, chitra } = await trip();
    expect(await friendBalances(asha)).toEqual({ Chitra: 966, Ravi: 800 });
    expect(await friendBalances(ravi)).toEqual({ Asha: -800, Chitra: 967 });
    expect(await friendBalances(chitra)).toEqual({ Asha: -966, Ravi: -967 });

    const summary = async (c: Client) =>
      BalanceSummaryResponseSchema.parse((await c.get('/balances/summary')).body);
    expect(await summary(asha)).toEqual({ owe_paise: 0, owed_paise: 1766, net_paise: 1766 });
    expect(await summary(ravi)).toEqual({ owe_paise: 800, owed_paise: 967, net_paise: 167 });
    expect(await summary(chitra)).toEqual({ owe_paise: 1933, owed_paise: 0, net_paise: -1933 });
  });

  it('my net per group on the groups list', async () => {
    const { asha, chitra } = await trip();
    const mine = GroupsResponseSchema.parse((await asha.get('/groups')).body).groups;
    expect(mine.map((g) => [g.name, g.my_net_paise])).toEqual([['Goa', 1766]]);
    const hers = GroupsResponseSchema.parse((await chitra.get('/groups')).body).groups;
    expect(hers[0]!.my_net_paise).toBe(-1933);
  });

  it('friend detail breaks the balance down per group and non-group', async () => {
    const { asha, ravi, groupId } = await trip();
    // Non-group: Asha pays ₹5.00 for both → Ravi owes 250 more.
    await addExpense(asha, {
      amount_paise: 500,
      paid_by_user_id: asha.id,
      split_type: 'equal',
      participants: [{ user_id: asha.id }, { user_id: ravi.id }],
    });
    const detail = FriendDetailResponseSchema.parse((await asha.get(`/friends/${ravi.id}`)).body);
    expect(detail.balance).toEqual({
      total_paise: 1050,
      by_scope: [
        { group: { id: groupId, name: 'Goa' }, balance_paise: 800 },
        { group: null, balance_paise: 250 },
      ],
    });
    expect(detail.shared_groups[0]!.my_net_paise).toBe(1766);
    // And from Ravi's side it's the mirror image.
    const mirror = FriendDetailResponseSchema.parse((await ravi.get(`/friends/${asha.id}`)).body);
    expect(mirror.balance.total_paise).toBe(-1050);
  });

  it('soft-deleted expenses are excluded everywhere', async () => {
    const { asha, ravi, chitra, groupId, e1 } = await trip();
    db.update(expenses)
      .set({ deletedAt: Date.now(), deletedByUserId: asha.id })
      .where(eq(expenses.id, e1))
      .run();
    // Without E1 (Asha's ₹30 dinner): Asha −234, Ravi +1167, Chitra −933.
    expect(await nets(asha, groupId)).toEqual({
      [asha.id]: -234,
      [ravi.id]: 1167,
      [chitra.id]: -933,
    });
    expect(await friendBalances(asha)).toEqual({ Chitra: -34, Ravi: -200 });
  });

  it('balances are 404 for non-members', async () => {
    const { groupId } = await trip();
    const outsider = await signUp('Dev');
    expect((await outsider.get(`/groups/${groupId}/balances`)).status).toBe(404);
  });

  it('a placeholder’s balances count before they sign up', async () => {
    const asha = await signUp('Asha');
    const bina = (await asha.post('/friends', { name: 'Bina', email: 'bina@example.com' })).body
      .friend;
    await addExpense(asha, {
      amount_paise: 999,
      paid_by_user_id: asha.id,
      split_type: 'equal',
      participants: [{ user_id: asha.id }, { user_id: bina.id }],
    });
    // 999 / 2 → Asha (lower id) 500, Bina 499.
    expect(await friendBalances(asha)).toEqual({ Bina: 499 });
  });
});

describe('DELETE /friends/:id (unfriend)', () => {
  it('is blocked while you share a group', async () => {
    const { asha, ravi } = await trip();
    const res = await asha.del(`/friends/${ravi.id}`);
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/both in Goa/);
  });

  it('is blocked while the balance is non-zero, and allowed once it is 0', async () => {
    const asha = await signUp('Asha');
    const dev = await signUp('Dev');
    await asha.post('/friends', { name: 'Dev', email: 'dev@example.com' });
    const pair = [{ user_id: asha.id }, { user_id: dev.id }];
    await addExpense(asha, {
      amount_paise: 400,
      paid_by_user_id: asha.id,
      split_type: 'equal',
      participants: pair,
    });
    expect((await asha.del(`/friends/${dev.id}`)).status).toBe(409);

    // Dev pays the same back → 0.
    await addExpense(asha, {
      amount_paise: 400,
      paid_by_user_id: dev.id,
      split_type: 'equal',
      participants: pair,
    });
    expect((await asha.del(`/friends/${dev.id}`)).status).toBe(204);
    expect(db.select().from(friendships).all()).toHaveLength(0);
    expect(await friendBalances(asha)).toEqual({});
    expect((await asha.get(`/friends/${dev.id}`)).status).toBe(404);
    // Expenses are untouched.
    expect(db.select().from(expenses).all()).toHaveLength(2);
  });

  it('is 404 for someone who is not your friend', async () => {
    const asha = await signUp('Asha');
    const dev = await signUp('Dev');
    expect((await asha.del(`/friends/${dev.id}`)).status).toBe(404);
  });
});

describe('DELETE /groups/:id/members/me (leave)', () => {
  it('is blocked while you owe or are owed anything in the group', async () => {
    const { chitra, groupId } = await trip();
    const res = await chitra.del(`/groups/${groupId}/members/me`);
    expect(res.status).toBe(409);
    expect(errorCode(res.body)).toBe('CONFLICT');
  });

  it('uses the strict rule: net 0 is not enough if pairwise balances remain', async () => {
    const asha = await signUp('Asha');
    const ravi = await signUp('Ravi');
    const chitra = await signUp('Chitra');
    const groupId = (
      await asha.post('/groups', {
        name: 'Flat',
        new_members: [
          { name: 'R', email: 'ravi@example.com' },
          { name: 'C', email: 'chitra@example.com' },
        ],
      })
    ).body.group.id;
    // Asha owes Ravi 100; Chitra owes Asha 100 → Asha's net is 0 but she isn't settled.
    await addExpense(asha, {
      group_id: groupId,
      amount_paise: 100,
      paid_by_user_id: ravi.id,
      split_type: 'equal',
      participants: [{ user_id: asha.id }],
    });
    await addExpense(asha, {
      group_id: groupId,
      amount_paise: 100,
      paid_by_user_id: asha.id,
      split_type: 'equal',
      participants: [{ user_id: chitra.id }],
    });
    expect((await nets(asha, groupId))[asha.id]).toBe(0);
    expect((await asha.del(`/groups/${groupId}/members/me`)).status).toBe(409);
  });

  it('works when settled: logs member_left, removes access, keeps the group for others', async () => {
    const { asha, ravi, groupId } = await trip();
    const dev = await signUp('Dev');
    await asha.post(`/groups/${groupId}/members`, { name: 'Dev', email: 'dev@example.com' });
    // Dev and Asha cancel out inside the group → all of Dev's balances are 0.
    await addExpense(asha, {
      group_id: groupId,
      amount_paise: 200,
      paid_by_user_id: dev.id,
      split_type: 'equal',
      participants: [{ user_id: asha.id }],
    });
    await addExpense(asha, {
      group_id: groupId,
      amount_paise: 200,
      paid_by_user_id: asha.id,
      split_type: 'equal',
      participants: [{ user_id: dev.id }],
    });

    expect((await dev.del(`/groups/${groupId}/members/me`)).status).toBe(204);

    const [left] = db.select().from(activities).where(eq(activities.type, 'member_left')).all();
    expect(left).toMatchObject({
      actorUserId: dev.id,
      groupId,
      payload: { member: { id: dev.id, name: 'Dev' } },
    });
    const recipients = db
      .select({ userId: activityRecipients.userId })
      .from(activityRecipients)
      .where(eq(activityRecipients.activityId, left!.id))
      .all()
      .map((r) => r.userId)
      .sort();
    expect(recipients).toEqual([1, 2, 3, dev.id].sort());

    // Dev loses access; the group carries on for everyone else.
    expect((await dev.get(`/groups/${groupId}`)).status).toBe(404);
    expect((await dev.get(`/groups/${groupId}/balances`)).status).toBe(404);
    expect(GroupsResponseSchema.parse((await dev.get('/groups')).body).groups).toEqual([]);
    const members = (await ravi.get(`/groups/${groupId}`)).body.group.members.map(
      (m: { name: string }) => m.name,
    );
    expect(members).not.toContain('Dev');
    // That group's expenses drop out of Dev's friend list too.
    const page = ExpensePageSchema.parse((await dev.get(`/friends/${asha.id}/expenses`)).body);
    expect(page.expenses).toEqual([]);
    // Leaving twice is a 404 (not a member any more).
    expect((await dev.del(`/groups/${groupId}/members/me`)).status).toBe(404);
  });
});
