import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import {
  FriendDetailResponseSchema,
  FriendsResponseSchema,
  GroupBalancesResponseSchema,
} from '@split-wise/shared';
import { createApp } from './app.js';
import { createDb, type Db } from './db/client.js';
import { activities, expenseShares, expenses, settlements } from './db/schema.js';

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

const balances = async (c: Client, groupId: number) =>
  GroupBalancesResponseSchema.parse((await c.get(`/groups/${groupId}/balances`)).body);
const friendBalances = async (c: Client) =>
  Object.fromEntries(
    FriendsResponseSchema.parse((await c.get('/friends')).body).friends.map((f) => [
      f.name,
      f.balance_paise,
    ]),
  );

/** Four friends in one group; each pays for the next one round the circle (A→B→C→D→A). */
async function circle(amounts: [number, number, number, number]) {
  const [a, b, c, d] = [await signUp('A'), await signUp('B'), await signUp('C'), await signUp('D')];
  const groupId = (
    await a.post('/groups', {
      name: 'Circle',
      new_members: ['b', 'c', 'd'].map((n) => ({
        name: n.toUpperCase(),
        email: `${n}@example.com`,
      })),
    })
  ).body.group.id as number;
  const people = [a, b, c, d];
  for (let i = 0; i < 4; i++) {
    const payer = people[i]!;
    const next = people[(i + 1) % 4]!;
    const res = await a.post('/expenses', {
      group_id: groupId,
      description: `${i}`,
      amount_paise: amounts[i],
      paid_by_user_id: payer.id,
      split_type: 'equal',
      participants: [{ user_id: next.id }],
      expense_date: TODAY,
    });
    expect(res.status).toBe(201);
  }
  return { a, b, c, d, people, groupId };
}

describe('DoD: circular debt A→B→C→D→A', () => {
  it('simplified mode (the default) gives ≤ 3 transfers; settling them all brings every net to 0', async () => {
    const { a, people, groupId } = await circle([100, 200, 300, 400]);
    const before = await balances(a, groupId);
    expect(before.simplified).toBe(true);
    expect(before.transfers.length).toBeLessThanOrEqual(3);
    expect(before.transfers.map((t) => [t.from.name, t.to.name, t.amount_paise])).toEqual([
      ['A', 'B', 100],
      ['A', 'C', 100],
      ['A', 'D', 100],
    ]);

    // Settle each suggestion exactly as the Settle button would.
    for (const t of before.transfers) {
      const res = await a.post('/settlements', {
        group_id: groupId,
        from_user_id: t.from.id,
        to_user_id: t.to.id,
        amount_paise: t.amount_paise,
        method: 'cash',
        settled_on: TODAY,
      });
      expect(res.status).toBe(201);
    }
    const after = await balances(a, groupId);
    expect(after.members.every((m) => m.net_paise === 0)).toBe(true);
    expect(after.transfers).toEqual([]);

    // …and every other view agrees: no friend balances, no summary, everyone may leave.
    for (const p of people) {
      expect(Object.values(await friendBalances(p)).every((v) => v === 0)).toBe(true);
      expect((await p.get('/balances/summary')).body).toEqual({
        owe_paise: 0,
        owed_paise: 0,
        net_paise: 0,
      });
    }
    expect((await people[3]!.del(`/groups/${groupId}/members/me`)).status).toBe(204);
  });

  it('equal amounts cancel out: simplified 0 transfers, raw 4', async () => {
    const { a, groupId } = await circle([500, 500, 500, 500]);
    expect((await balances(a, groupId)).transfers).toEqual([]);
    await a.patch(`/groups/${groupId}`, { simplify_debts: false });
    expect((await balances(a, groupId)).transfers).toHaveLength(4);
  });
});

describe('the simplify switch', () => {
  it('changes only the suggestions, never stored rows, and logs before/after', async () => {
    const { a, b, groupId } = await circle([100, 200, 300, 400]);
    const snapshot = () => ({
      expenses: db.select().from(expenses).all(),
      shares: db.select().from(expenseShares).all(),
      settlements: db.select().from(settlements).all(),
    });
    const stored = snapshot();

    const off = await b.patch(`/groups/${groupId}`, { simplify_debts: false });
    expect(off.status).toBe(200);
    expect(off.body.group.simplify_debts).toBe(false);
    const raw = await balances(a, groupId);
    expect(raw.simplified).toBe(false);
    expect(raw.transfers).toHaveLength(4);
    expect(snapshot()).toEqual(stored);

    const [log] = db
      .select()
      .from(activities)
      .where(eq(activities.type, 'group_settings_changed'))
      .all();
    expect(log).toMatchObject({
      actorUserId: b.id,
      payload: { before: { simplify_debts: true }, after: { simplify_debts: false } },
    });

    // Setting the same value again logs nothing.
    await b.patch(`/groups/${groupId}`, { simplify_debts: false });
    expect(
      db.select().from(activities).where(eq(activities.type, 'group_settings_changed')).all(),
    ).toHaveLength(1);
  });

  it('rejects empty changes and non-members', async () => {
    const { a, groupId } = await circle([100, 200, 300, 400]);
    const outsider = await signUp('Z');
    expect((await a.patch(`/groups/${groupId}`, {})).status).toBe(400);
    expect((await outsider.patch(`/groups/${groupId}`, { simplify_debts: false })).status).toBe(
      404,
    );
  });
});

describe('friend views follow the simplified group (SPEC §6)', () => {
  /** The M4 trip: nets Asha +1766, Ravi +167, Chitra −1933. */
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
    const add = (body: object) =>
      asha.post('/expenses', { group_id: groupId, expense_date: TODAY, description: 'X', ...body });
    await add({
      amount_paise: 3000,
      paid_by_user_id: asha.id,
      split_type: 'equal',
      participants: all,
    });
    await add({
      amount_paise: 1200,
      paid_by_user_id: ravi.id,
      split_type: 'exact',
      participants: [
        { user_id: asha.id, value: 200 },
        { user_id: chitra.id, value: 1000 },
      ],
    });
    await add({
      amount_paise: 100,
      paid_by_user_id: chitra.id,
      split_type: 'equal',
      participants: all,
    });
    return { asha, ravi, chitra, groupId };
  }

  it('friend balances, breakdown and summary use the simplified transfers', async () => {
    const { asha, ravi, chitra, groupId } = await trip();
    // Simplified: Chitra pays Asha 1766 and Ravi 167 — Asha and Ravi owe each other nothing.
    expect(
      (await balances(asha, groupId)).transfers.map((t) => [
        t.from.name,
        t.to.name,
        t.amount_paise,
      ]),
    ).toEqual([
      ['Chitra', 'Asha', 1766],
      ['Chitra', 'Ravi', 167],
    ]);
    expect(await friendBalances(asha)).toEqual({ Chitra: 1766, Ravi: 0 });
    expect(await friendBalances(ravi)).toEqual({ Asha: 0, Chitra: 167 });
    const detail = FriendDetailResponseSchema.parse((await asha.get(`/friends/${chitra.id}`)).body);
    expect(detail.balance).toEqual({
      total_paise: 1766,
      by_scope: [{ group: { id: groupId, name: 'Goa' }, balance_paise: 1766 }],
    });
    expect((await chitra.get('/balances/summary')).body).toEqual({
      owe_paise: 1933,
      owed_paise: 0,
      net_paise: -1933,
    });

    // Turning it off brings back the raw pairs (the M4 numbers).
    await asha.patch(`/groups/${groupId}`, { simplify_debts: false });
    expect(await friendBalances(asha)).toEqual({ Chitra: 966, Ravi: 800 });
  });

  it('paying the suggested amount clears the friend balance too', async () => {
    const { asha, chitra, groupId } = await trip();
    await chitra.post('/settlements', {
      group_id: groupId,
      from_user_id: chitra.id,
      to_user_id: asha.id,
      amount_paise: 1766,
      method: 'upi',
      settled_on: TODAY,
    });
    expect(await friendBalances(asha)).toEqual({ Chitra: 0, Ravi: 0 });
  });

  it('in a simplified group you may leave once your net is 0', async () => {
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
    // Asha owes Ravi 100 and Chitra owes Asha 100: Asha's net is 0 → simplified, Chitra just pays Ravi.
    const add = (body: object) =>
      asha.post('/expenses', {
        group_id: groupId,
        expense_date: TODAY,
        description: 'X',
        split_type: 'equal',
        ...body,
      });
    await add({
      amount_paise: 100,
      paid_by_user_id: ravi.id,
      participants: [{ user_id: asha.id }],
    });
    await add({
      amount_paise: 100,
      paid_by_user_id: asha.id,
      participants: [{ user_id: chitra.id }],
    });
    expect((await balances(asha, groupId)).transfers.map((t) => [t.from.name, t.to.name])).toEqual([
      ['Chitra', 'Ravi'],
    ]);
    expect((await asha.del(`/groups/${groupId}/members/me`)).status).toBe(204);
  });
});
