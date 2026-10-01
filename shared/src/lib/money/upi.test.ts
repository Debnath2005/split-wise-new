import { describe, expect, it } from 'vitest';
import { MAX_AMOUNT_PAISE } from './money.js';
import { UPI_NOTE_MAX, buildUpiUri, upiNote } from './upi.js';

const base = {
  vpa: 'ravi@okicici',
  payeeName: 'Ravi',
  amountPaise: 80000,
  note: 'Split-wise: Goa',
};
const params = (uri: string) => {
  expect(uri.startsWith('upi://pay?')).toBe(true);
  return Object.fromEntries(new URLSearchParams(uri.slice('upi://pay?'.length)));
};

describe('buildUpiUri', () => {
  it('builds the SPEC §8 link with every parameter', () => {
    expect(buildUpiUri(base)).toBe(
      'upi://pay?pa=ravi%40okicici&pn=Ravi&am=800.00&cu=INR&tn=Split-wise%3A%20Goa',
    );
  });

  it.each([
    [1, '0.01'],
    [5, '0.05'],
    [100, '1.00'],
    [12340, '123.40'],
    [MAX_AMOUNT_PAISE, '1000000.00'],
  ])('am for %i paise is %s (integer maths, no floats)', (amountPaise, am) => {
    expect(params(buildUpiUri({ ...base, amountPaise })).am).toBe(am);
  });

  it('encodes names and notes with spaces, &, = and non-ASCII', () => {
    const uri = buildUpiUri({
      ...base,
      payeeName: 'Ravi & Sons = Ltd',
      note: 'Split-wise: चाय & cab',
    });
    expect(uri).not.toMatch(/ /);
    expect(params(uri)).toMatchObject({ pn: 'Ravi & Sons = Ltd', tn: 'Split-wise: चाय & cab' });
  });

  it(`trims the note to ${UPI_NOTE_MAX} characters without splitting characters`, () => {
    const tn = params(buildUpiUri({ ...base, note: `Split-wise: ${'गोवा '.repeat(20)}` })).tn!;
    expect(Array.from(tn)).toHaveLength(UPI_NOTE_MAX);
    expect(tn.startsWith('Split-wise: ')).toBe(true);
  });

  it.each(['ravi', 'ravi@', '@okicici', 'ra vi@okicici', 'ravi@1bank'])(
    'rejects invalid UPI ID %j',
    (vpa) => {
      expect(() => buildUpiUri({ ...base, vpa })).toThrow(RangeError);
    },
  );

  it.each([0, -100, MAX_AMOUNT_PAISE + 1])('rejects amount %i', (amountPaise) => {
    expect(() => buildUpiUri({ ...base, amountPaise })).toThrow(RangeError);
  });

  it('rejects non-integer paise', () => {
    expect(() => buildUpiUri({ ...base, amountPaise: 12.5 })).toThrow(TypeError);
  });
});

describe('upiNote', () => {
  it('names the group, or just the app for non-group', () => {
    expect(upiNote('Goa trip')).toBe('Split-wise: Goa trip');
    expect(upiNote(null)).toBe('Split-wise');
  });
});
