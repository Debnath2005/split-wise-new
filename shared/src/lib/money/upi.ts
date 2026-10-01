/**
 * UPI deep links (SPEC §8, ADR-0013). The app only hands off to a UPI app — it can't verify
 * payments. The amount is built from integer paise, never from float formatting (ADR-0002).
 */
import { MAX_AMOUNT_PAISE, assertSafeInteger, paiseToRupeeString } from './money.js';

/** SPEC §8 VPA format, e.g. "ravi@okicici". */
export const UPI_VPA_REGEX = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,64}$/;

/** `tn` (transaction note) limit (SPEC §8). */
export const UPI_NOTE_MAX = 50;

export interface UpiLinkInput {
  vpa: string;
  payeeName: string;
  amountPaise: number;
  /** e.g. "Split-wise: Goa trip"; trimmed to 50 characters. */
  note: string;
}

/** `upi://pay?pa=…&pn=…&am=123.40&cu=INR&tn=…`, every value URI-encoded. */
export function buildUpiUri({ vpa, payeeName, amountPaise, note }: UpiLinkInput): string {
  if (!UPI_VPA_REGEX.test(vpa)) throw new RangeError('Invalid UPI ID');
  assertSafeInteger(amountPaise);
  if (amountPaise < 1 || amountPaise > MAX_AMOUNT_PAISE)
    throw new RangeError('Amount out of range');

  // Array.from keeps multi-byte characters whole when trimming.
  const tn = Array.from(note.trim()).slice(0, UPI_NOTE_MAX).join('');
  const params: [string, string][] = [
    ['pa', vpa],
    ['pn', payeeName.trim()],
    ['am', paiseToRupeeString(amountPaise)],
    ['cu', 'INR'],
    ['tn', tn],
  ];
  return `upi://pay?${params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`;
}

/** The note for a settlement: "Split-wise: <group>" or just "Split-wise" for non-group. */
export function upiNote(groupName: string | null): string {
  return groupName ? `Split-wise: ${groupName}` : 'Split-wise';
}
