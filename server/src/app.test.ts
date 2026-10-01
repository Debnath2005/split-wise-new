import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { ApiErrorSchema, HealthResponseSchema } from '@split-wise/shared';
import { createDb } from './db/client.js';
import { createApp } from './app.js';

const app = createApp({ db: createDb(':memory:'), logRequests: false });

describe('GET /api/v1/health', () => {
  it('reports API and DB as ok', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(HealthResponseSchema.parse(res.body)).toEqual({ status: 'ok', db: 'ok' });
  });
});

describe('unknown API routes', () => {
  it('return the JSON error envelope with 404', async () => {
    const res = await request(app).get('/api/v1/nope');
    expect(res.status).toBe(404);
    expect(ApiErrorSchema.parse(res.body).error.code).toBe('NOT_FOUND');
  });
});
