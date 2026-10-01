import type { ReactNode } from 'react';
import { NavLink } from 'react-router';
import { cx } from './cx';

export interface TabItem {
  to: string;
  label: string;
  icon: ReactNode;
}

/**
 * Primary navigation (SPEC §11): a fixed bottom tab bar on phones (with safe-area padding),
 * a left sidebar from 768px up.
 */
export function TabBar({ items, brand }: { items: TabItem[]; brand: ReactNode }) {
  return (
    <nav
      aria-label="Main"
      className={cx(
        'fixed inset-x-0 bottom-0 z-10 border-t border-gray-light-3 bg-white pb-[env(safe-area-inset-bottom)]',
        'md:inset-y-0 md:right-auto md:w-56 md:border-t-0 md:border-r md:pt-6 md:pb-0',
      )}
    >
      <div className="hidden px-5 pb-6 md:block">{brand}</div>
      <ul className="grid grid-cols-4 md:flex md:flex-col md:gap-1 md:px-3">
        {items.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              className={({ isActive }) =>
                cx(
                  'flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-semibold',
                  'md:min-h-11 md:flex-row md:justify-start md:gap-3 md:rounded-control md:px-3 md:text-sm',
                  isActive ? 'text-ink md:bg-brand-soft' : 'text-gray-dark-2 hover:text-ink',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cx(
                      'flex h-7 w-12 items-center justify-center rounded-full md:h-auto md:w-auto',
                      isActive && 'bg-brand-soft md:bg-transparent',
                    )}
                  >
                    {item.icon}
                  </span>
                  {item.label}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
