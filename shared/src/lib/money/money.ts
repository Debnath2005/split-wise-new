/**
 * Money primitives (SPEC §4, ADR-0002). Every amount is an integer number of paise.
 * Rupee strings are converted with string math only — never parseFloat or `* 100`.
 */

/** Largest amount for a single expense: ₹10,00,000.00. */
export const MAX_AMOUNT_PAISE = 100_000_000;

/** 100% expressed in basis points. */
export const FULL_PERCENT_BP = 10_000;

const RUPEES_PATTERN = /^(\d{1,8})(?:\.(\d{1,2}))?$/;
const PERCENT_PATTERN = /^(\d{1,3})(?:\.(\d{1,2}))?$/;

export type ParseResult =
  { ok: true; value: number } | { ok: false; error: 'INVALID_FORMAT' | 'TOO_SMALL' | 'TOO_LARGE' };

export function assertSafeInteger(value: number, what = 'paise'): void {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`Expected an integer number of ${what}, got ${value}`);
  }
}

/**
 * Parses user input like "1,234.5" into paise (123450).
 * `min` defaults to 1 paisa; pass `min: 0` where a zero amount is valid (e.g. an exact-split share).
 */
export function parseRupeesToPaise(input: string, { min = 1 }: { min?: number } = {}): ParseResult {
  const match = RUPEES_PATTERN.exec(input.trim().replaceAll(',', ''));
  if (!match) return { ok: false, error: 'INVALID_FORMAT' };
  const [, rupees = '', fraction = ''] = match;
  const value = Number(rupees) * 100 + Number(fraction.padEnd(2, '0'));
  if (value < min) return { ok: false, error: 'TOO_SMALL' };
  if (value > MAX_AMOUNT_PAISE) return { ok: false, error: 'TOO_LARGE' };
  return { ok: true, value };
}

/** Parses a percentage like "33.33" into basis points (3333). Range 0–100%. */
export function parsePercentToBasisPoints(input: string): ParseResult {
  const match = PERCENT_PATTERN.exec(input.trim());
  if (!match) return { ok: false, error: 'INVALID_FORMAT' };
  const [, whole = '', fraction = ''] = match;
  const value = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (value > FULL_PERCENT_BP) return { ok: false, error: 'TOO_LARGE' };
  return { ok: true, value };
}

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Formats paise for display: 12345600 → "₹1,23,456.00". The only place paise are divided. */
export function formatPaise(paise: number): string {
  assertSafeInteger(paise);
  return inr.format(paise / 100);
}

/** Plain rupee string built from integers: 12340 → "123.40". Used for UPI `am=` and input prefill. */
export function paiseToRupeeString(paise: number): string {
  assertSafeInteger(paise);
  const sign = paise < 0 ? '-' : '';
  const abs = Math.abs(paise);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** Basis points to a percent string: 3333 → "33.33", 5000 → "50". */
export function basisPointsToPercentString(bp: number): string {
  assertSafeInteger(bp, 'basis points');
  const whole = Math.floor(bp / 100);
  const fraction = bp % 100;
  return fraction === 0 ? String(whole) : `${whole}.${String(fraction).padStart(2, '0')}`;
}
