import { describe, expect, it } from 'vitest';
import {
  ApiErrorSchema,
  HealthResponseSchema,
  CreateExpenseRequestSchema,
  CreateGroupRequestSchema,
  ExpenseDateSchema,
  PersonInputSchema,
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

describe('PersonInputSchema', () => {
  it('normalises email and phone', () => {
    expect(
      PersonInputSchema.parse({ name: ' Ravi ', email: ' Ravi@X.com ', phone: '+91 98765-43210' }),
    ).toEqual({ name: 'Ravi', email: 'ravi@x.com', phone: '+919876543210' });
  });

  it('needs an email or a phone, reporting it on the email field', () => {
    const result = PersonInputSchema.safeParse({ name: 'Ravi', email: '', phone: '  ' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({
      path: ['email'],
      message: 'Add an email or a phone number',
    });
  });

  it('accepts phone only', () => {
    expect(PersonInputSchema.parse({ name: 'Ravi', phone: '+919876543210' })).toMatchObject({
      phone: '+919876543210',
    });
  });
});

describe('CreateGroupRequestSchema', () => {
  it('defaults member lists to empty and trims the name', () => {
    expect(CreateGroupRequestSchema.parse({ name: ' Goa ' })).toEqual({
      name: 'Goa',
      member_ids: [],
      new_members: [],
    });
  });

  it('rejects a blank name and unknown fields', () => {
    expect(CreateGroupRequestSchema.safeParse({ name: '  ' }).success).toBe(false);
    expect(CreateGroupRequestSchema.safeParse({ name: 'G', memberIds: [1] }).success).toBe(false);
  });
});

describe('SignupRequestSchema phone', () => {
  it('is optional, and blank means none', () => {
    const base = { name: 'A', email: 'a@b.co', password: 'longenough' };
    expect(SignupRequestSchema.parse(base).phone).toBeUndefined();
    expect(SignupRequestSchema.parse({ ...base, phone: '' }).phone).toBeNull();
    expect(SignupRequestSchema.parse({ ...base, phone: '+91 98765 43210' }).phone).toBe(
      '+919876543210',
    );
  });
});

describe('ExpenseDateSchema', () => {
  it.each(['2026-10-01', '2028-02-29', '2000-01-01', '2100-12-31'])('accepts %s', (d) => {
    expect(ExpenseDateSchema.safeParse(d).success).toBe(true);
  });

  it.each([
    '2026-02-29',
    '2026-02-30',
    '2026-13-01',
    '1999-12-31',
    '2101-01-01',
    '2026-1-5',
    '01-10-2026',
    '',
  ])('rejects %j', (d) => {
    expect(ExpenseDateSchema.safeParse(d).success).toBe(false);
  });
});

describe('CreateExpenseRequestSchema', () => {
  const base = {
    description: ' Dinner ',
    amount_paise: 10000,
    paid_by_user_id: 1,
    split_type: 'equal',
    participants: [{ user_id: 1 }, { user_id: 2 }],
    expense_date: '2026-10-01',
  };

  it('trims the description and treats blank notes as none', () => {
    expect(CreateExpenseRequestSchema.parse({ ...base, notes: '  ' })).toMatchObject({
      description: 'Dinner',
      notes: null,
    });
  });

  it('never accepts shares from the client', () => {
    const withShares = { ...base, participants: [{ user_id: 1, owed_paise: 10000 }] };
    expect(CreateExpenseRequestSchema.safeParse(withShares).success).toBe(false);
  });

  it('requires integer paise within range', () => {
    for (const amount_paise of [0, 12.5, 100_000_001]) {
      expect(CreateExpenseRequestSchema.safeParse({ ...base, amount_paise }).success).toBe(false);
    }
  });

  it('rejects a description over 100 characters', () => {
    expect(
      CreateExpenseRequestSchema.safeParse({ ...base, description: 'x'.repeat(101) }).success,
    ).toBe(false);
  });
});
