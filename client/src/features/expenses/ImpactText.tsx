import { expenseImpact, formatPaise } from '@split-wise/shared';
import { cx } from '../../components/ui/cx';

interface ImpactTextProps {
  amountPaise: number;
  paidByUserId: number;
  mySharePaise: number;
  meId: number;
  align?: 'end' | 'start';
}

/** "you lent ₹800" (green) / "you borrowed ₹400" (red) / "not involved" (grey) — SPEC §11. */
export function ImpactText({
  amountPaise,
  paidByUserId,
  mySharePaise,
  meId,
  align = 'end',
}: ImpactTextProps) {
  const impact = expenseImpact({ amountPaise, paidByUserId, mySharePaise }, meId);
  const involved = paidByUserId === meId || mySharePaise > 0;
  const [label, amount, tone] = !involved
    ? ['not involved', null, 'text-gray-dark-2']
    : impact > 0
      ? ['you lent', formatPaise(impact), 'text-green-text']
      : impact < 0
        ? ['you borrowed', formatPaise(-impact), 'text-danger']
        : ['no balance', null, 'text-gray-dark-2'];
  return (
    <span
      className={cx(
        'flex shrink-0 flex-col text-sm',
        align === 'end' ? 'items-end text-right' : 'items-start',
        tone,
      )}
    >
      <span>{label}</span>
      {amount && <span className="font-semibold">{amount}</span>}
    </span>
  );
}
