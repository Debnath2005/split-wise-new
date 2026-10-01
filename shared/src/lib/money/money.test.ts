import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  MAX_AMOUNT_PAISE,
  basisPointsToPercentString,
  formatPaise,
  paiseToRupeeString,
  parsePercentToBasisPoints,
  parseRupeesToPaise,
} from './money.js';

describe('parseRupeesToPaise', () => {
  it.each([
    ['123.4', 12340],
    ['123.45', 12345],
    ['0.1', 10],
    ['0.01', 1],
    ['1,234.5', 123450],
    ['1,00,000', 10000000],
    ['  42  ', 4200],
    ['007', 700],
    ['1000000', MAX_AMOUNT_PAISE],
    ['1000000.00', MAX_AMOUNT_PAISE],
  ])('parses %j → %i paise', (input, paise) => {
    expect(parseRupeesToPaise(input)).toEqual({ ok: true, value: paise });
  });

  it.each([
    '',
    ' ',
    'abc',
    '1e3',
    '-5',
    '+5',
    '.5',
    '12.',
    '1.234',
    '1 000',
    '१२',
    'NaN',
    'Infinity',
  ])('rejects %j as INVALID_FORMAT', (input) => {
    expect(parseRupeesToPaise(input)).toEqual({ ok: false, error: 'INVALID_FORMAT' });
  });

  it('rejects zero by default and allows it with min: 0', () => {
    expect(parseRupeesToPaise('0')).toEqual({ ok: false, error: 'TOO_SMALL' });
    expect(parseRupeesToPaise('0.00', { min: 0 })).toEqual({ ok: true, value: 0 });
  });

  it('rejects amounts above ₹10,00,000.00', () => {
    expect(parseRupeesToPaise('1000000.01')).toEqual({ ok: false, error: 'TOO_LARGE' });
    expect(parseRupeesToPaise('99999999')).toEqual({ ok: false, error: 'TOO_LARGE' });
    expect(parseRupeesToPaise('123456789')).toEqual({ ok: false, error: 'INVALID_FORMAT' });
  });

  it('round-trips with paiseToRupeeString for every valid amount', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: MAX_AMOUNT_PAISE }), (paise) => {
        expect(parseRupeesToPaise(paiseToRupeeString(paise))).toEqual({ ok: true, value: paise });
      }),
    );
  });
});

describe('formatPaise', () => {
  it.each([
    [12340, '₹123.40'],
    [0, '₹0.00'],
    [1, '₹0.01'],
    [12345600, '₹1,23,456.00'],
    [MAX_AMOUNT_PAISE, '₹10,00,000.00'],
    [-37500, '-₹375.00'],
  ])('formats %i as %s', (paise, text) => {
    expect(formatPaise(paise)).toBe(text);
  });

  it('throws on non-integer input', () => {
    expect(() => formatPaise(12.5)).toThrow(TypeError);
    expect(() => formatPaise(Number.NaN)).toThrow(TypeError);
  });
});

describe('paiseToRupeeString', () => {
  it.each([
    [12340, '123.40'],
    [5, '0.05'],
    [100, '1.00'],
    [-250, '-2.50'],
  ])('converts %i to %s', (paise, text) => {
    expect(paiseToRupeeString(paise)).toBe(text);
  });
});

describe('parsePercentToBasisPoints', () => {
  it.each([
    ['33.33', 3333],
    ['50', 5000],
    ['0.5', 50],
    ['100', 10000],
    ['0', 0],
  ])('parses %j → %i bp', (input, bp) => {
    expect(parsePercentToBasisPoints(input)).toEqual({ ok: true, value: bp });
  });

  it.each(['33.333', '-1', '1e2', '', '.5'])('rejects %j', (input) => {
    expect(parsePercentToBasisPoints(input)).toEqual({ ok: false, error: 'INVALID_FORMAT' });
  });

  it('rejects more than 100%', () => {
    expect(parsePercentToBasisPoints('100.01')).toEqual({ ok: false, error: 'TOO_LARGE' });
  });

  it('round-trips with basisPointsToPercentString', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10000 }), (bp) => {
        expect(parsePercentToBasisPoints(basisPointsToPercentString(bp))).toEqual({
          ok: true,
          value: bp,
        });
      }),
    );
  });
});
