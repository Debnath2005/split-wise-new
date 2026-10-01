import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { ApiErrorSchema, MeResponseSchema } from '@split-wise/shared';
import { createApp } from './app.js';
import { createDb, type Db } from './db/client.js';
import { sessions, users } from './db/schema.js';

const RELAXED = { authPerMinute: 1000, apiPerMinute: 1000 };
const ASHA = { name: 'Asha', email: 'asha@example.com', password: 'correct horse' };

let db: Db;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  db = createDb(':memory:');
  app = createApp({ db, rateLimits: RELAXED, logRequests: false });
});

/** A cookie-keeping client that always sends the CSRF header on writes. */
function client(target = app) {
  const agent = request.agent(target);
  return {
    get: (path: string) => agent.get(`/api/v1${path}`),
    post: (path: string, body?: object) =>
      agent.post(`/api/v1${path}`).set('X-Requested-With', 'fetch').send(body),
    patch: (path: string, body: object) =>
      agent.patch(`/api/v1${path}`).set('X-Requested-With', 'fetch').send(body),
  };
}

async function signedUp() {
  const c = client();
  const res = await c.post('/auth/signup', ASHA);
  expect(res.status).toBe(201);
  return c;
}

const errorCode = (body: unknown) => ApiErrorSchema.parse(body).error.code;
const fieldErrors = (body: unknown) =>
  (ApiErrorSchema.parse(body).error.details as { fieldErrors: Record<string, string[]> })
    .fieldErrors;

describe('signup', () => {
  it('creates the user, sets a secure-by-config session cookie and logs them in', async () => {
    const c = client();
    const res = await c.post('/auth/signup', { ...ASHA, email: ' Asha@Example.COM ' });
    expect(res.status).toBe(201);
    expect(MeResponseSchema.parse(res.body).user).toMatchObject({
      name: 'Asha',
      email: 'asha@example.com',
      phone: null,
      upi_vpa: null,
    });
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/^sid=[\w-]{43};/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Max-Age=2592000/);
    expect(cookie).not.toMatch(/Secure/);

    const me = await c.get('/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('asha@example.com');
  });

  it('sets the Secure flag when cookieSecure is on', async () => {
    const secureApp = createApp({
      db,
      rateLimits: RELAXED,
      logRequests: false,
      cookieSecure: true,
    });
    const res = await client(secureApp).post('/auth/signup', ASHA);
    expect(String(res.headers['set-cookie'])).toMatch(/Secure/);
  });

  it('stores an argon2id hash, never the password', async () => {
    await signedUp();
    const row = db.select().from(users).where(eq(users.email, ASHA.email)).get()!;
    expect(row.passwordHash).toMatch(/^\$argon2id\$/);
    expect(row.passwordHash).not.toContain(ASHA.password);
  });

  it('rejects a duplicate email regardless of case with 409', async () => {
    await signedUp();
    const res = await client().post('/auth/signup', { ...ASHA, email: 'ASHA@example.com' });
    expect(res.status).toBe(409);
    expect(errorCode(res.body)).toBe('CONFLICT');
  });

  it('returns VALIDATION_ERROR with per-field messages', async () => {
    const res = await client().post('/auth/signup', { name: '', email: 'nope', password: 'short' });
    expect(res.status).toBe(400);
    expect(errorCode(res.body)).toBe('VALIDATION_ERROR');
    expect(Object.keys(fieldErrors(res.body)).sort()).toEqual(['email', 'name', 'password']);
  });

  it('rejects malformed JSON with the error envelope', async () => {
    const res = await request(app)
      .post('/api/v1/auth/signup')
      .set('X-Requested-With', 'fetch')
      .set('Content-Type', 'application/json')
      .send('{"name":');
    expect(res.status).toBe(400);
    expect(errorCode(res.body)).toBe('VALIDATION_ERROR');
  });
});

describe('login and logout', () => {
  it('logs in with the right password (email case-insensitive)', async () => {
    await signedUp();
    const c = client();
    const res = await c.post('/auth/login', { email: 'ASHA@example.com', password: ASHA.password });
    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe('Asha');
    expect((await c.get('/auth/me')).status).toBe(200);
  });

  it.each([
    ['wrong password', { email: ASHA.email, password: 'wrong password' }],
    ['unknown email', { email: 'nobody@example.com', password: ASHA.password }],
  ])('returns the same 401 for %s', async (_case, body) => {
    await signedUp();
    const res = await client().post('/auth/login', body);
    expect(res.status).toBe(401);
    expect(ApiErrorSchema.parse(res.body).error).toEqual({
      code: 'UNAUTHENTICATED',
      message: 'Email or password is incorrect',
    });
  });

  it('cannot log in as a placeholder user', async () => {
    db.insert(users).values({ name: 'Ravi', email: 'ravi@example.com', isPlaceholder: true }).run();
    const res = await client().post('/auth/login', {
      email: 'ravi@example.com',
      password: 'anything1',
    });
    expect(res.status).toBe(401);
  });

  it('logout deletes the session server-side and clears the cookie', async () => {
    const c = await signedUp();
    expect(db.select().from(sessions).all()).toHaveLength(1);
    const res = await c.post('/auth/logout');
    expect(res.status).toBe(204);
    expect(String(res.headers['set-cookie'])).toMatch(/sid=;/);
    expect(db.select().from(sessions).all()).toHaveLength(0);
    expect((await c.get('/auth/me')).status).toBe(401);
  });
});

describe('sessions', () => {
  it('stores only the SHA-256 of the cookie token', async () => {
    const res = await client().post('/auth/signup', ASHA);
    const token = /sid=([^;]+)/.exec(String(res.headers['set-cookie']))![1]!;
    const [row] = db.select().from(sessions).all();
    expect(row!.id).toBe(createHash('sha256').update(token).digest('hex'));
    expect(row!.id).not.toBe(token);
  });

  it('rejects and removes an expired session', async () => {
    const c = await signedUp();
    db.update(sessions)
      .set({ expiresAt: Date.now() - 1 })
      .run();
    expect((await c.get('/auth/me')).status).toBe(401);
    expect(db.select().from(sessions).all()).toHaveLength(0);
  });

  it('extends the expiry (sliding) once the session has been idle for an hour', async () => {
    const c = await signedUp();
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
    db.update(sessions)
      .set({ lastSeenAt: twoHoursAgo, expiresAt: twoHoursAgo + 1000 * 60 * 60 * 24 })
      .run();
    const res = await c.get('/auth/me');
    expect(res.status).toBe(200);
    expect(String(res.headers['set-cookie'])).toMatch(/Max-Age=2592000/);
    const [row] = db.select().from(sessions).all();
    expect(row!.expiresAt).toBeGreaterThan(Date.now() + 29 * 24 * 60 * 60 * 1000);
  });

  it('ignores a forged cookie', async () => {
    const res = await request(app).get('/api/v1/auth/me').set('Cookie', 'sid=forged');
    expect(res.status).toBe(401);
    expect(errorCode(res.body)).toBe('UNAUTHENTICATED');
  });
});

describe('CSRF header', () => {
  it('rejects writes without X-Requested-With: fetch', async () => {
    const res = await request(app).post('/api/v1/auth/signup').send(ASHA);
    expect(res.status).toBe(403);
    expect(errorCode(res.body)).toBe('FORBIDDEN');
    expect(db.select().from(users).all()).toHaveLength(0);
  });

  it('does not require the header on GET', async () => {
    expect((await request(app).get('/api/v1/health')).status).toBe(200);
  });
});

describe('rate limits', () => {
  it('allows 5 login attempts per minute per IP + email, then 429', async () => {
    const strict = createApp({ db, logRequests: false });
    const c = client(strict);
    const attempt = (email = ASHA.email) => c.post('/auth/login', { email, password: 'wrong pw' });
    for (let i = 0; i < 5; i++) expect((await attempt()).status).toBe(401);
    const limited = await attempt();
    expect(limited.status).toBe(429);
    expect(errorCode(limited.body)).toBe('RATE_LIMITED');
    expect((await attempt('other@example.com')).status).toBe(401);
  });

  it('limits signups to 5 per minute per IP', async () => {
    const strict = createApp({ db, logRequests: false });
    for (let i = 0; i < 5; i++) {
      const res = await client(strict).post('/auth/signup', {
        ...ASHA,
        email: `u${i}@example.com`,
      });
      expect(res.status).toBe(201);
    }
    const res = await client(strict).post('/auth/signup', { ...ASHA, email: 'u5@example.com' });
    expect(res.status).toBe(429);
  });
});

describe('PATCH /me', () => {
  it('requires login', async () => {
    const res = await client().patch('/me', { name: 'X' });
    expect(res.status).toBe(401);
  });

  it('updates name, phone and UPI ID, and clears them with blanks', async () => {
    const c = await signedUp();
    const res = await c.patch('/me', {
      name: 'Asha K',
      phone: '+91 98765 43210',
      upi_vpa: 'asha@okicici',
    });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      name: 'Asha K',
      phone: '+919876543210',
      upi_vpa: 'asha@okicici',
    });
    const cleared = await c.patch('/me', { phone: '', upi_vpa: ' ' });
    expect(cleared.body.user).toMatchObject({ phone: null, upi_vpa: null });
    expect((await c.get('/auth/me')).body.user.name).toBe('Asha K');
  });

  it('rejects an invalid UPI ID with a field error', async () => {
    const c = await signedUp();
    const res = await c.patch('/me', { upi_vpa: 'not-a-vpa' });
    expect(res.status).toBe(400);
    expect(fieldErrors(res.body)).toHaveProperty('upi_vpa');
  });

  it('does not allow changing the email', async () => {
    const c = await signedUp();
    const res = await c.patch('/me', { email: 'new@example.com' });
    expect(res.status).toBe(400);
  });

  it('rejects a phone number that belongs to another account', async () => {
    const asha = await signedUp();
    await asha.patch('/me', { phone: '+919876543210' });
    const ravi = client();
    await ravi.post('/auth/signup', {
      name: 'Ravi',
      email: 'ravi@example.com',
      password: 'longenough',
    });
    const res = await ravi.patch('/me', { phone: '+919876543210' });
    expect(res.status).toBe(400);
    expect(fieldErrors(res.body)).toHaveProperty('phone');
  });
});

describe('POST /me/password', () => {
  it('changes the password when the current one is right', async () => {
    const c = await signedUp();
    const res = await c.post('/me/password', { current: ASHA.password, next: 'brand new pass' });
    expect(res.status).toBe(204);
    const old = await client().post('/auth/login', { email: ASHA.email, password: ASHA.password });
    expect(old.status).toBe(401);
    const fresh = await client().post('/auth/login', {
      email: ASHA.email,
      password: 'brand new pass',
    });
    expect(fresh.status).toBe(200);
  });

  it('rejects a wrong current password as a field error', async () => {
    const c = await signedUp();
    const res = await c.post('/me/password', { current: 'nope nope', next: 'brand new pass' });
    expect(res.status).toBe(400);
    expect(fieldErrors(res.body)).toHaveProperty('current');
  });

  it('enforces the minimum length for the new password', async () => {
    const c = await signedUp();
    const res = await c.post('/me/password', { current: ASHA.password, next: 'short' });
    expect(res.status).toBe(400);
    expect(fieldErrors(res.body)).toHaveProperty('next');
  });
});
