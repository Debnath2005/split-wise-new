import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import {
  ApiErrorSchema,
  FriendDetailResponseSchema,
  FriendsResponseSchema,
  GroupDetailResponseSchema,
  GroupsResponseSchema,
  MAX_GROUP_MEMBERS,
} from '@split-wise/shared';
import { createApp } from './app.js';
import { createDb, type Db } from './db/client.js';
import { activities, activityRecipients, friendships, groups, users } from './db/schema.js';

const RELAXED = { authPerMinute: 10_000, apiPerMinute: 10_000 };

let db: Db;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  db = createDb(':memory:');
  app = createApp({ db, rateLimits: RELAXED, logRequests: false });
});

type Client = ReturnType<typeof client>;

function client() {
  const agent = request.agent(app);
  const write = (method: 'post' | 'patch', path: string, body?: object) =>
    agent[method](`/api/v1${path}`).set('X-Requested-With', 'fetch').send(body);
  return {
    get: (path: string) => agent.get(`/api/v1${path}`),
    post: (path: string, body?: object) => write('post', path, body),
    patch: (path: string, body: object) => write('patch', path, body),
  };
}

async function signUp(
  name: string,
  extra: { phone?: string } = {},
): Promise<Client & { id: number }> {
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

const errorOf = (body: unknown) => ApiErrorSchema.parse(body).error;
const fieldErrors = (body: unknown) =>
  (errorOf(body).details as { fieldErrors: Record<string, string[]> }).fieldErrors;
const friendNames = async (c: Client) =>
  FriendsResponseSchema.parse((await c.get('/friends')).body).friends.map((f) => f.name);

function activitiesFor(userId: number) {
  return db
    .select({ type: activities.type, payload: activities.payload, groupId: activities.groupId })
    .from(activityRecipients)
    .innerJoin(activities, eq(activities.id, activityRecipients.activityId))
    .where(eq(activityRecipients.userId, userId))
    .orderBy(activities.id)
    .all();
}

describe('POST /friends', () => {
  it('requires login', async () => {
    expect((await client().post('/friends', { name: 'X', email: 'x@example.com' })).status).toBe(
      401,
    );
  });

  it('adds an existing user found by email (any case) and logs friend_added for both', async () => {
    const asha = await signUp('Asha');
    const ravi = await signUp('Ravi');
    const res = await asha.post('/friends', { name: 'Whatever', email: ' RAVI@Example.com ' });
    expect(res.status).toBe(201);
    expect(res.body.friend).toEqual({
      id: ravi.id,
      name: 'Ravi', // the existing name wins over the typed one
      email: 'ravi@example.com',
      phone: null,
      is_placeholder: false,
    });
    expect(await friendNames(asha)).toEqual(['Ravi']);
    expect(await friendNames(ravi)).toEqual(['Asha']);
    for (const id of [asha.id, ravi.id]) {
      expect(activitiesFor(id).map((a) => a.type)).toEqual(['friend_added']);
    }
  });

  it('matches by phone regardless of formatting', async () => {
    const asha = await signUp('Asha');
    const ravi = await signUp('Ravi', { phone: '+919876543210' });
    const res = await asha.post('/friends', { name: 'R', phone: '+91 98765-43210' });
    expect(res.body.friend.id).toBe(ravi.id);
  });

  it('creates a placeholder owned by the actor when nobody matches', async () => {
    const asha = await signUp('Asha');
    const res = await asha.post('/friends', { name: 'Chitra', email: 'chitra@example.com' });
    expect(res.status).toBe(201);
    expect(res.body.friend).toMatchObject({ name: 'Chitra', is_placeholder: true });
    const row = db.select().from(users).where(eq(users.id, res.body.friend.id)).get()!;
    expect(row).toMatchObject({
      isPlaceholder: true,
      passwordHash: null,
      createdByUserId: asha.id,
    });
  });

  it('is idempotent: re-adding returns 200 with no second friendship or activity', async () => {
    const asha = await signUp('Asha');
    await asha.post('/friends', { name: 'Chitra', email: 'chitra@example.com' });
    const again = await asha.post('/friends', { name: 'Chitra', email: 'chitra@example.com' });
    expect(again.status).toBe(200);
    expect(db.select().from(friendships).all()).toHaveLength(1);
    expect(db.select().from(users).all()).toHaveLength(2);
    expect(activitiesFor(asha.id)).toHaveLength(1);
  });

  it('stores friendships once with the lower id first', async () => {
    await signUp('Asha');
    const ravi = await signUp('Ravi');
    await ravi.post('/friends', { name: 'Asha', email: 'asha@example.com' });
    const [row] = db.select().from(friendships).all();
    expect(row!.userLowId).toBeLessThan(row!.userHighId);
  });

  it.each([
    ['no contact', { name: 'Chitra' }, 400, 'VALIDATION_ERROR'],
    ['yourself', { name: 'Me', email: 'asha@example.com' }, 400, 'VALIDATION_ERROR'],
  ])('rejects %s', async (_case, body, status, code) => {
    const asha = await signUp('Asha');
    const res = await asha.post('/friends', body);
    expect(res.status).toBe(status);
    expect(errorOf(res.body).code).toBe(code);
  });

  it('rejects an email and phone that belong to different people', async () => {
    const asha = await signUp('Asha');
    await signUp('Ravi', { phone: '+919876543210' });
    await signUp('Bina');
    const res = await asha.post('/friends', {
      name: 'X',
      email: 'bina@example.com',
      phone: '+919876543210',
    });
    expect(res.status).toBe(409);
  });
});

describe('GET /friends/:userId', () => {
  it('returns the friend with shared groups', async () => {
    const asha = await signUp('Asha');
    const ravi = await signUp('Ravi');
    await asha.post('/groups', {
      name: 'Goa',
      new_members: [{ name: 'Ravi', email: 'ravi@example.com' }],
    });
    const res = await asha.get(`/friends/${ravi.id}`);
    const detail = FriendDetailResponseSchema.parse(res.body);
    expect(detail.friend.name).toBe('Ravi');
    expect(detail.shared_groups).toEqual([
      { id: expect.any(Number), name: 'Goa', member_count: 2, my_net_paise: 0 },
    ]);
  });

  it('is 404 for someone who is not your friend, or a bad id', async () => {
    const asha = await signUp('Asha');
    const ravi = await signUp('Ravi');
    expect((await asha.get(`/friends/${ravi.id}`)).status).toBe(404);
    expect((await asha.get('/friends/abc')).status).toBe(404);
  });
});

describe('groups', () => {
  it('creates a group with friends and new people, befriending every member pair', async () => {
    const asha = await signUp('Asha');
    const ravi = await signUp('Ravi');
    await asha.post('/friends', { name: 'Ravi', email: 'ravi@example.com' });

    const res = await asha.post('/groups', {
      name: '  Goa Trip ',
      member_ids: [ravi.id],
      new_members: [{ name: 'Chitra', email: 'chitra@example.com' }],
    });
    expect(res.status).toBe(201);
    const { group } = GroupDetailResponseSchema.parse(res.body);
    expect(group.name).toBe('Goa Trip');
    expect(group.simplify_debts).toBe(true);
    expect(group.members.map((m) => [m.name, m.is_placeholder])).toEqual([
      ['Asha', false],
      ['Ravi', false],
      ['Chitra', true],
    ]);
    // Ravi and Chitra became friends through the group.
    expect(await friendNames(ravi)).toEqual(['Asha', 'Chitra']);
    expect(db.select().from(friendships).all()).toHaveLength(3);

    const chitraId = group.members[2]!.id;
    for (const id of [asha.id, ravi.id, chitraId]) {
      expect(activitiesFor(id).at(-1)).toMatchObject({ type: 'group_created', groupId: group.id });
    }
  });

  it('lists only my groups with member counts, newest first', async () => {
    const asha = await signUp('Asha');
    const ravi = await signUp('Ravi');
    await asha.post('/groups', { name: 'Flat' });
    await asha.post('/groups', {
      name: 'Goa',
      new_members: [{ name: 'R', email: 'ravi@example.com' }],
    });
    const mine = GroupsResponseSchema.parse((await asha.get('/groups')).body).groups;
    expect(mine.map((g) => [g.name, g.member_count])).toEqual([
      ['Goa', 2],
      ['Flat', 1],
    ]);
    const his = GroupsResponseSchema.parse((await ravi.get('/groups')).body).groups;
    expect(his.map((g) => g.name)).toEqual(['Goa']);
  });

  it('rejects member_ids of people who are not your friends', async () => {
    const asha = await signUp('Asha');
    const ravi = await signUp('Ravi');
    const res = await asha.post('/groups', { name: 'Goa', member_ids: [ravi.id] });
    expect(res.status).toBe(400);
    expect(fieldErrors(res.body)).toHaveProperty('member_ids');
    expect(db.select().from(groups).all()).toHaveLength(0);
  });

  it('writes nothing when any part of the request fails (one transaction)', async () => {
    const asha = await signUp('Asha');
    await signUp('Ravi', { phone: '+919876543210' });
    await signUp('Bina');
    const before = db.select().from(users).all().length;
    const res = await asha.post('/groups', {
      name: 'Goa',
      new_members: [
        { name: 'Chitra', email: 'chitra@example.com' },
        { name: 'X', email: 'bina@example.com', phone: '+919876543210' }, // conflict
      ],
    });
    expect(res.status).toBe(409);
    expect(db.select().from(groups).all()).toHaveLength(0);
    expect(db.select().from(users).all()).toHaveLength(before); // no orphan Chitra placeholder
    expect(
      db
        .select()
        .from(activities)
        .all()
        .filter((a) => a.type === 'group_created'),
    ).toHaveLength(0);
  });

  it(`caps groups at ${MAX_GROUP_MEMBERS} members`, async () => {
    const asha = await signUp('Asha');
    const people = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ name: `P${i}`, email: `p${i}@example.com` }));
    const full = await asha.post('/groups', {
      name: 'Big',
      new_members: people(MAX_GROUP_MEMBERS - 1),
    });
    expect(full.status).toBe(201);
    const extra = await asha.post(`/groups/${full.body.group.id}/members`, {
      name: 'One more',
      email: 'more@example.com',
    });
    expect(extra.status).toBe(409);
  });

  it('is 404 for non-members on every group route', async () => {
    const asha = await signUp('Asha');
    const ravi = await signUp('Ravi');
    const id = (await asha.post('/groups', { name: 'Private' })).body.group.id;
    expect((await ravi.get(`/groups/${id}`)).status).toBe(404);
    expect((await ravi.patch(`/groups/${id}`, { name: 'Mine now' })).status).toBe(404);
    expect(
      (await ravi.post(`/groups/${id}/members`, { name: 'X', email: 'x@example.com' })).status,
    ).toBe(404);
    expect((await asha.get('/groups/999')).status).toBe(404);
  });

  it('renames a group and logs before/after for all members', async () => {
    const asha = await signUp('Asha');
    const ravi = await signUp('Ravi');
    const id = (
      await asha.post('/groups', {
        name: 'Goa',
        new_members: [{ name: 'R', email: 'ravi@example.com' }],
      })
    ).body.group.id;
    const res = await ravi.patch(`/groups/${id}`, { name: 'Goa 2026' });
    expect(res.body.group.name).toBe('Goa 2026');
    expect(activitiesFor(asha.id).at(-1)).toMatchObject({
      type: 'group_settings_changed',
      payload: { before: { name: 'Goa' }, after: { name: 'Goa 2026' } },
    });
    const unchanged = await ravi.patch(`/groups/${id}`, { name: 'Goa 2026' });
    expect(unchanged.status).toBe(200);
    expect(activitiesFor(asha.id).filter((a) => a.type === 'group_settings_changed')).toHaveLength(
      1,
    );
  });

  it('adds a member (friend by id or new person), befriends them with everyone, and logs it', async () => {
    const asha = await signUp('Asha');
    const ravi = await signUp('Ravi');
    const bina = await signUp('Bina');
    await asha.post('/friends', { name: 'Bina', email: 'bina@example.com' });
    const id = (
      await asha.post('/groups', {
        name: 'Goa',
        new_members: [{ name: 'R', email: 'ravi@example.com' }],
      })
    ).body.group.id;

    const byId = await asha.post(`/groups/${id}/members`, { user_id: bina.id });
    expect(byId.status).toBe(201);
    expect(await friendNames(ravi)).toEqual(['Asha', 'Bina']);
    expect(activitiesFor(ravi.id).at(-1)).toMatchObject({
      type: 'member_added',
      payload: { member: { id: bina.id, name: 'Bina' } },
    });

    const byEmail = await ravi.post(`/groups/${id}/members`, {
      name: 'Dev',
      email: 'dev@example.com',
    });
    expect(byEmail.body.group.members.map((m: { name: string }) => m.name)).toEqual([
      'Asha',
      'Ravi',
      'Bina',
      'Dev',
    ]);

    const dup = await ravi.post(`/groups/${id}/members`, { user_id: bina.id });
    expect(dup.status).toBe(409);
  });

  it('rejects adding a non-friend by id', async () => {
    const asha = await signUp('Asha');
    const ravi = await signUp('Ravi');
    const id = (await asha.post('/groups', { name: 'Goa' })).body.group.id;
    const res = await asha.post(`/groups/${id}/members`, { user_id: ravi.id });
    expect(res.status).toBe(400);
  });
});

describe('claiming placeholders on signup', () => {
  it('DoD: A creates a group with B (registered) and C (placeholder); C signs up and sees it', async () => {
    const a = await signUp('Asha');
    const b = await signUp('Ravi');
    await a.post('/friends', { name: 'Ravi', email: 'ravi@example.com' });
    const created = await a.post('/groups', {
      name: 'Goa Trip',
      member_ids: [b.id],
      new_members: [{ name: 'Chitra (placeholder)', email: 'chitra@example.com' }],
    });
    const placeholderId = created.body.group.members[2].id;

    const c = client();
    const signup = await c.post('/auth/signup', {
      name: 'Chitra',
      email: 'Chitra@Example.com',
      password: 'long enough',
    });
    expect(signup.status).toBe(201);
    expect(signup.body.user.id).toBe(placeholderId); // same row, claimed in place

    const theirGroups = GroupsResponseSchema.parse((await c.get('/groups')).body).groups;
    expect(theirGroups.map((g) => g.name)).toEqual(['Goa Trip']);
    expect(await friendNames(c)).toEqual(['Asha', 'Ravi']);
    expect(activitiesFor(placeholderId).map((x) => x.type)).toContain('group_created');

    const row = db.select().from(users).where(eq(users.id, placeholderId)).get()!;
    expect(row).toMatchObject({ name: 'Chitra', isPlaceholder: false });
    expect(row.claimedAt).toEqual(expect.any(Number));
    // A's view now shows the real name and no "invited" flag.
    const asSeenByA = (await a.get(`/groups/${created.body.group.id}`)).body.group.members[2];
    expect(asSeenByA).toMatchObject({ name: 'Chitra', is_placeholder: false });
  });

  it('claims a placeholder added by phone when the signup phone matches', async () => {
    const asha = await signUp('Asha');
    const added = await asha.post('/friends', { name: 'Dev', phone: '+919811122233' });
    const dev = client();
    const res = await dev.post('/auth/signup', {
      name: 'Dev',
      email: 'dev@example.com',
      password: 'long enough',
      phone: '+91 98111 22233',
    });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ id: added.body.friend.id, phone: '+919811122233' });
    expect(await friendNames(dev)).toEqual(['Asha']);
  });

  it('prefers the email match and leaves a phone held by another placeholder alone', async () => {
    const asha = await signUp('Asha');
    const byEmail = (await asha.post('/friends', { name: 'E', email: 'dev@example.com' })).body
      .friend;
    const byPhone = (await asha.post('/friends', { name: 'P', phone: '+919811122233' })).body
      .friend;
    const res = await client().post('/auth/signup', {
      name: 'Dev',
      email: 'dev@example.com',
      password: 'long enough',
      phone: '+919811122233',
    });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ id: byEmail.id, phone: null });
    const other = db.select().from(users).where(eq(users.id, byPhone.id)).get()!;
    expect(other.isPlaceholder).toBe(true);
  });

  it('rejects a signup phone that belongs to a real account', async () => {
    await signUp('Ravi', { phone: '+919876543210' });
    const res = await client().post('/auth/signup', {
      name: 'Dev',
      email: 'dev@example.com',
      password: 'long enough',
      phone: '+919876543210',
    });
    expect(res.status).toBe(400);
    expect(fieldErrors(res.body)).toHaveProperty('phone');
  });

  it('still rejects an email that belongs to a real account', async () => {
    await signUp('Ravi');
    const res = await client().post('/auth/signup', {
      name: 'Imposter',
      email: 'ravi@example.com',
      password: 'long enough',
    });
    expect(res.status).toBe(409);
  });
});
