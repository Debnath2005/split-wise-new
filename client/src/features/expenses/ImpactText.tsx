import { expenseImpact } from '@split-wise/shared';
import { Money } from '../../components/ui/Money';
import { cx } from '../../components/ui/cx';

interface ImpactTextProps {
  amountPaise: number;
  paidByUserId: number;
  mySharePaise: number;
  meId: number;
  align?: 'end' | 'start';
}

/** "you lent ₹800" (chalk green) / "you borrowed ₹400" (chalk orange) / "not involved" (muted) — SPEC §11. */
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
    ? ['not involved', null, 'text-chalk-muted']
    : impact > 0
      ? ['you lent', impact, 'text-positive']
      : impact < 0
        ? ['you borrowed', -impact, 'text-negative']
        : ['no balance', null, 'text-chalk-muted'];
  return (
    <span
      className={cx(
        'flex shrink-0 flex-col text-lg',
        align === 'end' ? 'items-end text-right' : 'items-start',
        tone,
      )}
    >
      <span>{label}</span>
      {amount !== null && <Money paise={amount} className="font-semibold" />}
    </span>
  );
}
