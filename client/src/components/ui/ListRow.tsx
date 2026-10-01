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
        <span className="flex items-center gap-2 truncate font-semibold">{title}</span>
        {subtitle && <span className="block truncate text-sm text-gray-dark-2">{subtitle}</span>}
      </span>
      {trailing}
      {to && (
        <span className="text-gray-dark-2">
          <ChevronRightIcon />
        </span>
      )}
    </>
  );
  return (
    <li>
      {to ? (
        <Link to={to} className={cx(rowClass, 'hover:bg-gray-light-3/60')}>
          {body}
        </Link>
      ) : (
        <div className={rowClass}>{body}</div>
      )}
    </li>
  );
}

export function List({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <ul
      aria-label={label}
      className="divide-y divide-gray-light-3 overflow-hidden rounded-card border border-gray-light-3 bg-white"
    >
      {children}
    </ul>
  );
}
