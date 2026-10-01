import { formatPaise } from '@split-wise/shared';
import { cx } from './cx';

/** A rupee amount from integer paise, in JetBrains Mono with tabular figures. */
export function Money({ paise, className }: { paise: number; className?: string }) {
  return <span className={cx('money whitespace-nowrap', className)}>{formatPaise(paise)}</span>;
}
