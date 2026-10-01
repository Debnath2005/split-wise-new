import { describe, expect, it } from 'vitest';
import { ApiErrorSchema, HealthResponseSchema } from './schemas.js';

describe('HealthResponseSchema', () => {
  it('accepts a healthy response', () => {
    expect(HealthResponseSchema.parse({ status: 'ok', db: 'ok' })).toEqual({
      status: 'ok',
      db: 'ok',
    });
  });

  it('rejects unknown status values', () => {
    expect(HealthResponseSchema.safeParse({ status: 'up', db: 'ok' }).success).toBe(false);
  });
});

describe('ApiErrorSchema', () => {
  it('accepts the error envelope with optional details', () => {
    expect(ApiErrorSchema.safeParse({ error: { code: 'NOT_FOUND', message: 'x' } }).success).toBe(
      true,
    );
  });
});
