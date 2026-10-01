import { beforeEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import request from 'supertest';
import { eq, sql } from 'drizzle-orm';
import {
  ActivityPageSchema,
  FriendsResponseSchema,
  GroupBalancesResponseSchema,
  InvitePreviewResponseSchema,
  InviteResponseSchema,
} from '@split-wise/shared';
import { createApp } from './app.js';
import { createDb, type Db } from './db/client.js';
import { expenseShares, groupMembers, invites, settlements, users } from './db/schema.js';
import { MERGED_USER_REFERENCES } from './services/invites.js';

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
  };
}
type Client = ReturnType<typeof client> & { id: number };

async function signUp(name: string, extra: object = {}): Promise<Client> {
  const c = client();
  const res = await c.post('/auth/signup', {
    name,
    email: `${name.toLowerCase()}@example.com`,
    password: 'long enough',
    ...extra,
  });
  expect(res.status).toBe(201);
  return Object.assign(c, { id: res.body.user.id as number });
}

async function invite(c: Client, placeholderId: number) {
  const res = await c.post(`/users/${placeholderId}/invite`);
  expect(res.status).toBe(201);
  return InviteResponseSchema.parse(res.body).token;
}
const preview = async (token: string) =>
  InvitePreviewResponseSchema.parse((await client().get(`/invites/${token}`)).body);
const friendBalances = async (c: Client) =>
  Object.fromEntries(
    FriendsResponseSchema.parse((await c.get('/friends')).body).friends.map((f) => [
      f.id,
      f.balance_paise,
    ]),
  );
const nets = async (c: Client, groupId: number) =>
  Object.fromEntries(
    GroupBalancesResponseSchema.parse(
      (await c.get(`/groups/${groupId}/balances`)).body,
    ).members.map((m) => [m.user.id, m.net_paise]),
  );

describe('creating and previewing invite links', () => {
  it('creates a single-use token for a placeholder, storing only its hash', async () => {
    const asha = await signUp('Asha');
    const bina = (await asha.post('/friends', { name: 'Bina', email: 'bina@example.com' })).body
      .friend;
    const token = await invite(asha, bina.id);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const [row] = db.select().from(invites).all();
    expect(row!.tokenHash).toBe(createHash('sha256').update(token).digest('hex'));
    expect(row!.expiresAt - Date.now()).toBeGreaterThan(29 * 24 * 60 * 60 * 1000);
    expect(await preview(token)).toEqual({
      valid: true,
      inviter_name: 'Asha',
      invitee_name: 'Bina',
    });
  });

  it('only for a placeholder you are friends with', async () => {
    const asha = await signUp('Asha');
    const ravi = await signUp('Ravi');
    const bina = (await asha.post('/friends', { name: 'Bina', email: 'bina@example.com' })).body
      .friend;
    expect((await ravi.post(`/users/${bina.id}/invite`)).status).toBe(404); // not Ravi's friend
    await asha.post('/friends', { name: 'R', email: 'ravi@example.com' });
    expect((await asha.post(`/users/${ravi.id}/invite`)).status).toBe(404); // real account
  });

  it('a new link replaces the old one', async () => {
    const asha = await signUp('Asha');
    const bina = (await asha.post('/friends', { name: 'Bina', email: 'bina@example.com' })).body
      .friend;
    const first = await invite(asha, bina.id);
    const second = await invite(asha, bina.id);
    expect((await preview(first)).valid).toBe(false);
    expect((await preview(second)).valid).toBe(true);
  });

  it('unknown, malformed and expired links all just say invalid', async () => {
    const asha = await signUp('Asha');
    const bina = (await asha.post('/friends', { name: 'Bina', email: 'bina@example.com' })).body
      .friend;
    const token = await invite(asha, bina.id);
    db.update(invites)
      .set({ expiresAt: Date.now() - 1 })
      .run();
    expect(await preview(token)).toEqual({ valid: false });
    expect(await preview('x'.repeat(43))).toEqual({ valid: false });
    expect(await preview('not-a-token')).toEqual({ valid: false });
  });
});

describe('signing up through a link', () => {
  it('claims that placeholder in place even with a different email, then the link is used up', async () => {
    const asha = await signUp('Asha');
    const bina = (await asha.post('/friends', { name: 'Bina', email: 'bina@example.com' })).body
      .friend;
    const groupId = (await asha.post('/groups', { name: 'Goa', member_ids: [bina.id] })).body.group
      .id;
    const token = await invite(asha, bina.id);

    const c = client();
    const res = await c.post('/auth/signup', {
      name: 'Bina R',
      email: 'bina.r@work.com',
      password: 'long enough',
      invite_token: token,
    });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ id: bina.id, name: 'Bina R', email: 'bina.r@work.com' });
    expect((await c.get('/groups')).body.groups.map((g: { id: number }) => g.id)).toEqual([
      groupId,
    ]);
    expect((await preview(token)).valid).toBe(false);

    const again = await client().post('/auth/signup', {
      name: 'X',
      email: 'x@example.com',
      password: 'long enough',
      invite_token: token,
    });
    expect(again.status).toBe(400);
    expect(again.body.error.details.fieldErrors).toHaveProperty('invite_token');
  });

  it('still refuses an email that belongs to a real account', async () => {
    const asha = await signUp('Asha');
    await signUp('Ravi');
    const bina = (await asha.post('/friends', { name: 'Bina', email: 'bina@example.com' })).body
      .friend;
    const token = await invite(asha, bina.id);
    const res = await client().post('/auth/signup', {
      name: 'B',
      email: 'ravi@example.com',
      password: 'long enough',
      invite_token: token,
    });
    expect(res.status).toBe(409);
    expect((await preview(token)).valid).toBe(true); // nothing was used up
  });

  it('folds in another placeholder that already holds the email', async () => {
    const asha = await signUp('Asha');
    const byLink = (await asha.post('/friends', { name: 'Bina', phone: '+919811122233' })).body
      .friend;
    const byEmail = (await asha.post('/friends', { name: 'B (email)', email: 'bina@example.com' }))
      .body.friend;
    await asha.post('/expenses', {
      description: 'Tea',
      amount_paise: 200,
      paid_by_user_id: asha.id,
      split_type: 'equal',
      participants: [{ user_id: byEmail.id }],
      expense_date: TODAY,
    });
    const token = await invite(asha, byLink.id);
    const res = await client().post('/auth/signup', {
      name: 'Bina',
      email: 'bina@example.com',
      password: 'long enough',
      invite_token: token,
    });
    expect(res.status).toBe(201);
    expect(res.body.user.id).toBe(byLink.id);
    expect(db.select().from(users).where(eq(users.id, byEmail.id)).get()).toBeUndefined();
    expect(await friendBalances(asha)).toEqual({ [byLink.id]: 200 });
  });
});

describe('accepting a link while logged in merges the placeholder (ADR-0015)', () => {
  /**
   * Asha (real) created placeholder P. Dev (real, the same person as P) already has his own
   * history with Asha. Both P and Dev are in "Goa" and both are in one of its expenses.
   */
  async function scenario() {
    const asha = await signUp('Asha');
    const ravi = await signUp('Ravi');
    const dev = await signUp('Dev');
    const p = (await asha.post('/friends', { name: 'Dev (old)', email: 'dev.old@example.com' }))
      .body.friend as { id: number };
    const groupId = (
      await asha.post('/groups', {
        name: 'Goa',
        member_ids: [p.id],
        new_members: [
          { name: 'R', email: 'ravi@example.com' },
          { name: 'D', email: 'dev@example.com' },
        ],
      })
    ).body.group.id as number;
    const add = (body: object) =>
      asha
        .post('/expenses', { group_id: groupId, expense_date: TODAY, description: 'X', ...body })
        .then((r) => expect(r.status).toBe(201));
    // P and Dev both in one split (shares must be summed).
    await add({
      amount_paise: 4000,
      paid_by_user_id: asha.id,
      split_type: 'equal',
      participants: [asha.id, ravi.id, dev.id, p.id].map((user_id) => ({ user_id })),
    });
    // P paid for Ravi; Dev paid for Asha; a percent split with P.
    await add({
      amount_paise: 1000,
      paid_by_user_id: p.id,
      split_type: 'equal',
      participants: [{ user_id: ravi.id }],
    });
    await add({
      amount_paise: 700,
      paid_by_user_id: dev.id,
      split_type: 'equal',
      participants: [{ user_id: asha.id }],
    });
    await add({
      amount_paise: 999,
      paid_by_user_id: ravi.id,
      split_type: 'percent',
      participants: [
        { user_id: p.id, value: 6000 },
        { user_id: dev.id, value: 4000 },
      ],
    });
    // A payment between P and Dev (becomes a payment to himself) and one from P to Asha.
    await asha.post('/settlements', {
      group_id: groupId,
      from_user_id: dev.id,
      to_user_id: p.id,
      amount_paise: 50,
      method: 'cash',
      settled_on: TODAY,
    });
    await asha.post('/settlements', {
      group_id: groupId,
      from_user_id: p.id,
      to_user_id: asha.id,
      amount_paise: 300,
      method: 'cash',
      settled_on: TODAY,
    });
    // Dev's own non-group history with Asha.
    await asha.post('/friends', { name: 'D', email: 'dev@example.com' });
    await asha.post('/expenses', {
      description: 'Cab',
      amount_paise: 600,
      paid_by_user_id: asha.id,
      split_type: 'equal',
      participants: [{ user_id: asha.id }, { user_id: dev.id }],
      expense_date: TODAY,
    });
    return { asha, ravi, dev, p, groupId };
  }

  it('keeps every balance: Dev ends up with exactly P + Dev, nobody else changes', async () => {
    const { asha, ravi, dev, p, groupId } = await scenario();
    const before = {
      nets: await nets(asha, groupId),
      asha: await friendBalances(asha),
      ravi: await friendBalances(ravi),
    };
    const token = await invite(asha, p.id);

    const res = await dev.post(`/invites/${token}/accept`);
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(dev.id);

    const after = {
      nets: await nets(asha, groupId),
      asha: await friendBalances(asha),
      ravi: await friendBalances(ravi),
    };
    expect(after.nets).toEqual({
      [asha.id]: before.nets[asha.id],
      [ravi.id]: before.nets[ravi.id],
      [dev.id]: before.nets[dev.id]! + before.nets[p.id]!,
    });
    expect(Object.values(after.nets).reduce((a, b) => a + b, 0)).toBe(0);
    expect(after.asha).toEqual({
      [ravi.id]: before.asha[ravi.id],
      [dev.id]: before.asha[dev.id]! + before.asha[p.id]!,
    });
    expect(after.ravi).toEqual({
      [asha.id]: before.ravi[asha.id],
      [dev.id]: before.ravi[dev.id]! + before.ravi[p.id]!,
    });

    // One membership, one share per expense, no payment to himself, placeholder gone.
    expect(
      db.select().from(groupMembers).where(eq(groupMembers.userId, dev.id)).all(),
    ).toHaveLength(1);
    const dup = db.all<{ n: number }>(
      sql`SELECT COUNT(*) n FROM expense_shares GROUP BY expense_id, user_id HAVING n > 1`,
    );
    expect(dup).toEqual([]);
    expect(db.select().from(expenseShares).where(eq(expenseShares.userId, p.id)).all()).toEqual([]);
    expect(
      db
        .select()
        .from(settlements)
        .all()
        .every((s) => s.fromUserId !== s.toUserId),
    ).toBe(true);
    expect(db.select().from(users).where(eq(users.id, p.id)).get()).toBeUndefined();
    expect((await asha.get(`/friends/${p.id}`)).status).toBe(404);
    expect((await preview(token)).valid).toBe(false);
  });

  it("rewrites history so P's items read as Dev's", async () => {
    const { asha, dev, p } = await scenario();
    const token = await invite(asha, p.id);
    await dev.post(`/invites/${token}/accept`);
    const page = ActivityPageSchema.parse((await dev.get('/activity?limit=50')).body);
    const paidByP = page.items.find(
      (i) => i.type === 'expense_created' && i.payload.expense.amount_paise === 1000,
    );
    if (paidByP?.type !== 'expense_created') throw new Error('missing item');
    expect(paidByP.payload.expense.paid_by_user_id).toBe(dev.id);
    const shared = page.items.find(
      (i) => i.type === 'expense_created' && i.payload.expense.amount_paise === 4000,
    );
    if (shared?.type !== 'expense_created') throw new Error('missing item');
    expect(shared.payload.expense.shares.filter((s) => s.user_id === dev.id)).toEqual([
      { user_id: dev.id, owed_paise: 2000 },
    ]);
    // No item appears twice.
    expect(new Set(page.items.map((i) => i.id)).size).toBe(page.items.length);
  });

  it('refuses your own invite, used links and nonsense', async () => {
    const asha = await signUp('Asha');
    const dev = await signUp('Dev');
    const p = (await asha.post('/friends', { name: 'P', email: 'p@example.com' })).body.friend;
    const token = await invite(asha, p.id);
    expect((await asha.post(`/invites/${token}/accept`)).status).toBe(400);
    expect((await dev.post(`/invites/${token}/accept`)).status).toBe(200);
    expect((await dev.post(`/invites/${token}/accept`)).status).toBe(400);
    expect((await dev.post(`/invites/${'x'.repeat(43)}/accept`)).status).toBe(400);
    expect((await client().post(`/invites/${token}/accept`)).status).toBe(401);
  });

  it('MERGED_USER_REFERENCES lists every foreign key to users (add new ones to the merge!)', () => {
    const tables = db
      .all<{ name: string }>(sql`SELECT name FROM sqlite_master WHERE type = 'table'`)
      .filter((t) => !t.name.startsWith('__') && !t.name.startsWith('sqlite_'));
    expect(tables.length).toBeGreaterThan(5); // guard against an empty comparison
    const refs: string[] = [];
    for (const { name } of tables) {
      for (const fk of db.all<{ table: string; from: string }>(
        sql.raw(`PRAGMA foreign_key_list(${name})`),
      )) {
        if (fk.table === 'users') refs.push(`${name}.${fk.from}`);
      }
    }
    expect(refs.sort()).toEqual([...MERGED_USER_REFERENCES].sort());
  });
});
