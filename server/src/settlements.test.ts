import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import {
  ActivityPageSchema,
  ApiErrorSchema,
  ExpensePageSchema,
  FriendDetailResponseSchema,
  FriendsResponseSchema,
  GroupBalancesResponseSchema,
  UpiLinkResponseSchema,
} from '@split-wise/shared';
import { createApp } from './app.js';
import { createDb, type Db } from './db/client.js';
import { activities, activityRecipients, settlements } from './db/schema.js';

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
  const write = (method: 'post' | 'patch' | 'delete', path: string, body?: object) =>
    agent[method](`/api/v1${path}`).set('X-Requested-With', 'fetch').send(body);
  return {
    get: (path: string) => agent.get(`/api/v1${path}`),
    post: (path: string, body?: object) => write('post', path, body),
    patch: (path: string, body: object) => write('patch', path, body),
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

const settle = (c: Client, body: object) =>
  c.post('/settlements', { method: 'cash', settled_on: TODAY, ...body });

/** The M4 hand-worked trip (nets: Asha +1766, Ravi +167, Chitra −1933). */
async function trip() {
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
  await addExpense(asha, {
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
  return { asha, ravi, chitra, groupId };
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
      f.id,
      f.balance_paise,
    ]),
  );

describe('DoD: recording the payment brings the pair balance to 0', () => {
  it('group settlement clears that pair everywhere', async () => {
    const { asha, chitra, groupId } = await trip();
    expect((await friendBalances(asha))[chitra.id]).toBe(966);

    const res = await settle(chitra, {
      group_id: groupId,
      from_user_id: chitra.id,
      to_user_id: asha.id,
      amount_paise: 966,
      method: 'upi',
    });
    expect(res.status).toBe(201);
    expect(res.body.settlement).toMatchObject({
      kind: 'settlement',
      amount_paise: 966,
      method: 'upi',
      group: { name: 'Goa' },
    });

    expect((await friendBalances(asha))[chitra.id]).toBe(0);
    expect((await friendBalances(chitra))[asha.id]).toBe(0);
    // Group nets move by exactly the settled amount; Σ net stays 0.
    const after = await nets(asha, groupId);
    expect(after).toEqual({ [asha.id]: 800, 2: 167, [chitra.id]: -967 });
    expect(Object.values(after).reduce((a, b) => a + b, 0)).toBe(0);
    const transfers = GroupBalancesResponseSchema.parse(
      (await asha.get(`/groups/${groupId}/balances`)).body,
    ).transfers;
    expect(transfers.some((t) => t.from.id === chitra.id && t.to.id === asha.id)).toBe(false);
  });

  it('settling each scope from the friend page brings every scope and the total to 0', async () => {
    const { asha, ravi, groupId } = await trip();
    await addExpense(asha, {
      amount_paise: 500,
      paid_by_user_id: asha.id,
      split_type: 'equal',
      participants: [{ user_id: asha.id }, { user_id: ravi.id }],
    });
    const before = FriendDetailResponseSchema.parse(
      (await asha.get(`/friends/${ravi.id}`)).body,
    ).balance;
    expect(before.by_scope.map((s) => s.balance_paise)).toEqual([800, 250]);

    for (const scope of before.by_scope) {
      const r = await settle(ravi, {
        group_id: scope.group?.id ?? null,
        from_user_id: ravi.id,
        to_user_id: asha.id,
        amount_paise: scope.balance_paise,
      });
      expect(r.status).toBe(201);
    }
    const after = FriendDetailResponseSchema.parse(
      (await asha.get(`/friends/${ravi.id}`)).body,
    ).balance;
    expect(after).toEqual({
      total_paise: 0,
      by_scope: [
        { group: { id: groupId, name: 'Goa' }, balance_paise: 0 },
        { group: null, balance_paise: 0 },
      ],
    });
    // Ravi now owes nobody (Chitra still owes him ₹9.67 in Goa).
    expect((await ravi.get('/balances/summary')).body).toMatchObject({
      owe_paise: 0,
      owed_paise: 967,
    });
  });

  it('once every pair is settled, leaving the group and unfriending are allowed', async () => {
    const { asha, ravi, chitra, groupId } = await trip();
    await settle(ravi, {
      group_id: groupId,
      from_user_id: ravi.id,
      to_user_id: asha.id,
      amount_paise: 800,
    });
    await settle(chitra, {
      group_id: groupId,
      from_user_id: chitra.id,
      to_user_id: asha.id,
      amount_paise: 966,
    });
    await settle(chitra, {
      group_id: groupId,
      from_user_id: chitra.id,
      to_user_id: ravi.id,
      amount_paise: 967,
    });
    expect(Object.values(await nets(asha, groupId)).every((n) => n === 0)).toBe(true);
    expect((await chitra.del(`/groups/${groupId}/members/me`)).status).toBe(204);
    expect((await asha.del(`/friends/${chitra.id}`)).status).toBe(204);
  });
});

describe('who can record a settlement', () => {
  it('in a group, any member may record one between two members', async () => {
    const { asha, ravi, chitra, groupId } = await trip();
    const res = await settle(ravi, {
      group_id: groupId,
      from_user_id: chitra.id,
      to_user_id: asha.id,
      amount_paise: 100,
    });
    expect(res.status).toBe(201);
  });

  it('group: outsiders get 404; both people must be members', async () => {
    const { asha, groupId } = await trip();
    const dev = await signUp('Dev');
    expect(
      (
        await settle(dev, {
          group_id: groupId,
          from_user_id: dev.id,
          to_user_id: asha.id,
          amount_paise: 100,
        })
      ).status,
    ).toBe(404);
    const res = await settle(asha, {
      group_id: groupId,
      from_user_id: dev.id,
      to_user_id: asha.id,
      amount_paise: 100,
    });
    expect(res.status).toBe(400);
  });

  it('non-group: you must be one of the two, and the other must be your friend', async () => {
    const { asha, ravi, chitra } = await trip();
    const dev = await signUp('Dev');
    expect(
      (await settle(asha, { from_user_id: ravi.id, to_user_id: chitra.id, amount_paise: 100 }))
        .status,
    ).toBe(400);
    expect(
      (await settle(asha, { from_user_id: asha.id, to_user_id: dev.id, amount_paise: 100 })).status,
    ).toBe(400);
    expect(
      (await settle(asha, { from_user_id: ravi.id, to_user_id: asha.id, amount_paise: 100 }))
        .status,
    ).toBe(201);
  });

  it.each([
    ['the same person twice', { from_user_id: 1, to_user_id: 1 }],
    ['a zero amount', { amount_paise: 0 }],
    ['a fractional amount', { amount_paise: 10.5 }],
    ['an unknown method', { method: 'cheque' }],
    ['an invalid date', { settled_on: '2026-02-30' }],
  ])('rejects %s', async (_case, override) => {
    const { asha, groupId } = await trip();
    const res = await settle(asha, {
      group_id: groupId,
      from_user_id: 2,
      to_user_id: 1,
      amount_paise: 100,
      ...override,
    });
    expect(res.status).toBe(400);
    expect(db.select().from(settlements).all()).toHaveLength(0);
  });
});

describe('deleting a settlement', () => {
  it('brings the debt back; parties or group members may delete; others get 404', async () => {
    const { asha, ravi, chitra, groupId } = await trip();
    const id = (
      await settle(chitra, {
        group_id: groupId,
        from_user_id: chitra.id,
        to_user_id: asha.id,
        amount_paise: 966,
      })
    ).body.settlement.id;
    const dev = await signUp('Dev');
    expect((await dev.del(`/settlements/${id}`)).status).toBe(404);
    expect((await ravi.del(`/settlements/${id}`)).status).toBe(204); // a group member
    expect((await friendBalances(asha))[chitra.id]).toBe(966);
    expect((await asha.del(`/settlements/${id}`)).status).toBe(404); // already deleted
  });
});

describe('activity', () => {
  it('logs settlement_created to all group members with a typed payload', async () => {
    const { asha, ravi, chitra, groupId } = await trip();
    await settle(chitra, {
      group_id: groupId,
      from_user_id: chitra.id,
      to_user_id: asha.id,
      amount_paise: 966,
      method: 'upi',
      note: 'Thanks!',
    });
    const [row] = db
      .select()
      .from(activities)
      .where(eq(activities.type, 'settlement_created'))
      .all();
    const recipients = db
      .select({ u: activityRecipients.userId })
      .from(activityRecipients)
      .where(eq(activityRecipients.activityId, row!.id))
      .all()
      .map((r) => r.u)
      .sort();
    expect(recipients).toEqual([asha.id, ravi.id, chitra.id].sort());

    const page = ActivityPageSchema.parse((await ravi.get('/activity')).body);
    const item = page.items[0]!;
    expect(item).toMatchObject({
      type: 'settlement_created',
      settlement_id: row!.settlementId,
      can_restore: false,
    });
    if (item.type !== 'settlement_created') throw new Error('expected a settlement');
    expect(item.payload.settlement).toMatchObject({
      from_user_id: chitra.id,
      to_user_id: asha.id,
      amount_paise: 966,
      method: 'upi',
      note: 'Thanks!',
    });
    expect(page.people).toMatchObject({ [String(chitra.id)]: 'Chitra', [String(asha.id)]: 'Asha' });
  });
});

describe('lists interleave settlements by date', () => {
  it('orders expenses and settlements together and paginates across both', async () => {
    const asha = await signUp('Asha');
    const ravi = await signUp('Ravi');
    const groupId = (
      await asha.post('/groups', {
        name: 'Flat',
        new_members: [{ name: 'R', email: 'ravi@example.com' }],
      })
    ).body.group.id;
    const both = [{ user_id: asha.id }, { user_id: ravi.id }];
    await addExpense(asha, {
      group_id: groupId,
      description: 'Old rent',
      amount_paise: 1000,
      paid_by_user_id: asha.id,
      split_type: 'equal',
      participants: both,
      expense_date: '2026-09-01',
    });
    await settle(ravi, {
      group_id: groupId,
      from_user_id: ravi.id,
      to_user_id: asha.id,
      amount_paise: 300,
      settled_on: '2026-09-15',
    });
    await addExpense(asha, {
      group_id: groupId,
      description: 'Today',
      amount_paise: 600,
      paid_by_user_id: ravi.id,
      split_type: 'equal',
      participants: both,
    });
    await settle(asha, {
      group_id: groupId,
      from_user_id: asha.id,
      to_user_id: ravi.id,
      amount_paise: 100,
    });

    const labels = (page: ReturnType<typeof ExpensePageSchema.parse>) =>
      page.expenses.map((e) => (e.kind === 'expense' ? e.description : `paid ${e.amount_paise}`));
    const all = ExpensePageSchema.parse((await asha.get(`/groups/${groupId}/expenses`)).body);
    // Same date: settlements sort before expenses.
    expect(labels(all)).toEqual(['paid 100', 'Today', 'paid 300', 'Old rent']);

    // Page through two at a time across both kinds.
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page = ExpensePageSchema.parse(
        (await asha.get(`/groups/${groupId}/expenses?limit=1${cursor ? `&before=${cursor}` : ''}`))
          .body,
      );
      seen.push(...labels(page));
      cursor = page.next_cursor;
    } while (cursor);
    expect(seen).toEqual(labels(all));
  });

  it('friend lists show only settlements between the two of you', async () => {
    const { asha, ravi, chitra, groupId } = await trip();
    await settle(ravi, {
      group_id: groupId,
      from_user_id: ravi.id,
      to_user_id: asha.id,
      amount_paise: 800,
    });
    await settle(chitra, {
      group_id: groupId,
      from_user_id: chitra.id,
      to_user_id: ravi.id,
      amount_paise: 967,
    });
    const page = ExpensePageSchema.parse((await asha.get(`/friends/${ravi.id}/expenses`)).body);
    const settlementsShown = page.expenses.filter((e) => e.kind === 'settlement');
    expect(settlementsShown).toHaveLength(1);
    expect(settlementsShown[0]).toMatchObject({
      from: { id: ravi.id },
      to: { id: asha.id },
      amount_paise: 800,
    });
  });
});

describe('GET /settlements/upi-link', () => {
  it('returns 422 NO_VPA until the payee adds a UPI ID, then the exact URI', async () => {
    const { asha, chitra, groupId } = await trip();
    const url = `/settlements/upi-link?to=${asha.id}&amount_paise=966&group_id=${groupId}`;
    const none = await chitra.get(url);
    expect(none.status).toBe(422);
    expect(ApiErrorSchema.parse(none.body).error.code).toBe('NO_VPA');

    await asha.patch('/me', { upi_vpa: 'asha@okicici' });
    const link = UpiLinkResponseSchema.parse((await chitra.get(url)).body);
    expect(link).toEqual({
      uri: 'upi://pay?pa=asha%40okicici&pn=Asha&am=9.66&cu=INR&tn=Split-wise%3A%20Goa',
      vpa: 'asha@okicici',
      payee_name: 'Asha',
    });
  });

  it('is 404 for people you have nothing to do with, and 400 for bad parameters', async () => {
    const { asha, groupId } = await trip();
    const dev = await signUp('Dev');
    await dev.patch('/me', { upi_vpa: 'dev@okaxis' });
    expect((await asha.get(`/settlements/upi-link?to=${dev.id}&amount_paise=100`)).status).toBe(
      404,
    );
    expect(
      (await asha.get(`/settlements/upi-link?to=${dev.id}&amount_paise=100&group_id=${groupId}`))
        .status,
    ).toBe(404);
    expect((await asha.get(`/settlements/upi-link?to=${dev.id}&amount_paise=0`)).status).toBe(400);
  });
});

describe("a placeholder's UPI ID (set by its creator)", () => {
  it('lets the creator set it, then UPI links work for them', async () => {
    const asha = await signUp('Asha');
    const bina = (await asha.post('/friends', { name: 'Bina', email: 'bina@example.com' })).body
      .friend;
    const detail = FriendDetailResponseSchema.parse((await asha.get(`/friends/${bina.id}`)).body);
    expect(detail).toMatchObject({ upi_vpa: null, can_edit_upi_vpa: true });

    expect((await asha.patch(`/users/${bina.id}`, { upi_vpa: 'not a vpa' })).status).toBe(400);
    expect((await asha.patch(`/users/${bina.id}`, { upi_vpa: 'bina@ybl' })).status).toBe(200);
    expect(
      FriendDetailResponseSchema.parse((await asha.get(`/friends/${bina.id}`)).body).upi_vpa,
    ).toBe('bina@ybl');
    const link = UpiLinkResponseSchema.parse(
      (await asha.get(`/settlements/upi-link?to=${bina.id}&amount_paise=250`)).body,
    );
    expect(link.uri).toBe('upi://pay?pa=bina%40ybl&pn=Bina&am=2.50&cu=INR&tn=Split-wise');
  });

  it('is refused (404) for anyone else, and for real accounts', async () => {
    const asha = await signUp('Asha');
    const ravi = await signUp('Ravi');
    const bina = (await asha.post('/friends', { name: 'Bina', email: 'bina@example.com' })).body
      .friend;
    await ravi.post('/friends', { name: 'Bina', email: 'bina@example.com' });
    expect(
      FriendDetailResponseSchema.parse((await ravi.get(`/friends/${bina.id}`)).body)
        .can_edit_upi_vpa,
    ).toBe(false);
    expect((await ravi.patch(`/users/${bina.id}`, { upi_vpa: 'bina@ybl' })).status).toBe(404);
    await asha.post('/friends', { name: 'Ravi', email: 'ravi@example.com' });
    expect((await asha.patch(`/users/${ravi.id}`, { upi_vpa: 'ravi@ybl' })).status).toBe(404);
  });
});
