import { describe, expect, it } from 'vitest';
import {
  ApiErrorSchema,
  HealthResponseSchema,
  SignupRequestSchema,
  UpdateMeRequestSchema,
} from './schemas.js';

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

describe('SignupRequestSchema', () => {
  it('trims and lowercases the email', () => {
    const parsed = SignupRequestSchema.parse({
      name: '  Asha ',
      email: ' Asha@Example.COM ',
      password: 'longenough',
    });
    expect(parsed).toEqual({ name: 'Asha', email: 'asha@example.com', password: 'longenough' });
  });

  it('rejects short passwords and bad emails', () => {
    expect(
      SignupRequestSchema.safeParse({ name: 'A', email: 'a@b.co', password: 'short' }).success,
    ).toBe(false);
    expect(
      SignupRequestSchema.safeParse({ name: 'A', email: 'nope', password: 'longenough' }).success,
    ).toBe(false);
  });
});

describe('UpdateMeRequestSchema', () => {
  it('accepts valid UPI IDs and phones, normalising phone spacing', () => {
    expect(
      UpdateMeRequestSchema.parse({ upi_vpa: ' ravi.k@okicici ', phone: '+91 98765-43210' }),
    ).toEqual({ upi_vpa: 'ravi.k@okicici', phone: '+919876543210' });
  });

  it('turns blank fields into null (clear)', () => {
    expect(UpdateMeRequestSchema.parse({ upi_vpa: '  ', phone: '' })).toEqual({
      upi_vpa: null,
      phone: null,
    });
  });

  it.each(['ravi', 'ravi@', '@okicici', 'r@1bank', 'ra vi@okicici'])('rejects UPI ID %j', (v) => {
    expect(UpdateMeRequestSchema.safeParse({ upi_vpa: v }).success).toBe(false);
  });

  it.each(['9876543210', '+0123456789', '+91 abc'])('rejects phone %j', (v) => {
    expect(UpdateMeRequestSchema.safeParse({ phone: v }).success).toBe(false);
  });

  it('rejects unknown fields such as email', () => {
    expect(UpdateMeRequestSchema.safeParse({ email: 'x@y.z' }).success).toBe(false);
  });
});
