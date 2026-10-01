import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ChevronRightIcon } from './icons';
import { cx } from './cx';

interface ListRowProps {
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  /** Makes the whole row a link with a chevron. */
  to?: string;
}

const rowClass = 'flex min-h-16 items-center gap-3 px-4 py-2';

/** One row of a list; wrap rows in <List>. */
export function ListRow({ leading, title, subtitle, trailing, to }: ListRowProps) {
  const body = (
    <>
      {leading}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 truncate text-2xl/tight font-semibold">
          {title}
        </span>
        {subtitle && (
          <span className="block truncate text-lg/snug text-chalk-muted">{subtitle}</span>
        )}
      </span>
      {trailing}
      {to && (
        <span className="text-chalk-muted">
          <ChevronRightIcon />
        </span>
      )}
    </>
  );
  return (
    <li>
      {to ? (
        <Link to={to} className={cx(rowClass, 'transition-colors hover:bg-chalk/5')}>
          {body}
        </Link>
      ) : (
        <div className={rowClass}>{body}</div>
      )}
    </li>
  );
}

/** Rows separated by chalk-dashed lines; rows fade and rise in, staggered. */
export function List({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <ul
      aria-label={label}
      className="chalk-stagger divide-y divide-dashed divide-line overflow-hidden rounded-card border-[1.5px] border-dashed border-line-strong bg-board-raised shadow-card"
    >
      {children}
    </ul>
  );
}
