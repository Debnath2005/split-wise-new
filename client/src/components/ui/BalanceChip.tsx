import { Money } from './Money';
import { cx } from './cx';

/**
 * Whose point of view the balance is phrased from (positive paise = money flows to "you"/them):
 * - friend:  "owes you ₹X" / "you owe ₹X"
 * - group:   "you are owed ₹X" / "you owe ₹X"
 * - member:  "gets back ₹X" / "owes ₹X" (someone else's net in a group)
 */
type Perspective = 'friend' | 'group' | 'member';

const LABELS: Record<Perspective, { positive: string; negative: string }> = {
  friend: { positive: 'owes you', negative: 'you owe' },
  group: { positive: 'you are owed', negative: 'you owe' },
  member: { positive: 'gets back', negative: 'owes' },
};

/**
 * A balance with its words, never colour alone (SPEC §11): chalk green when money comes your
 * way, chalk orange when it goes out, muted when settled.
 */
export function BalanceChip({ paise, perspective }: { paise: number; perspective: Perspective }) {
  if (paise === 0) {
    return <span className="shrink-0 text-lg text-chalk-muted">settled up</span>;
  }
  const positive = paise > 0;
  return (
    <span
      className={cx(
        'flex shrink-0 flex-col items-end text-right text-lg leading-tight',
        positive ? 'text-positive' : 'text-negative',
      )}
    >
      <span>{positive ? LABELS[perspective].positive : LABELS[perspective].negative}</span>
      <Money paise={Math.abs(paise)} className="font-semibold" />
    </span>
  );
}
