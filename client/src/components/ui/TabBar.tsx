import type { ReactNode } from 'react';
import { NavLink } from 'react-router';
import { cx } from './cx';

export interface TabItem {
  to: string;
  label: string;
  icon: ReactNode;
  /** Shows a dot (e.g. unread activity). */
  badge?: boolean;
}

/**
 * Primary navigation (SPEC §11): fixed bottom tab bar on phones (with safe-area padding),
 * a left sidebar from 768px up. DESIGN.md: board surface, accent indicator on the active item.
 */
export function TabBar({ items, brand }: { items: TabItem[]; brand: ReactNode }) {
  return (
    <nav
      aria-label="Main"
      className={cx(
        'fixed inset-x-0 bottom-0 z-[100] border-t-[1.5px] border-dashed border-line-strong bg-board-raised pb-[env(safe-area-inset-bottom)]',
        'md:inset-y-0 md:right-auto md:w-56 md:border-t-0 md:border-r-[1.5px] md:pt-6 md:pb-0',
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
                  'relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-lg',
                  'md:min-h-11 md:flex-row md:justify-start md:gap-3 md:rounded-control md:px-3 md:text-xl',
                  isActive ? 'font-medium text-accent' : 'text-chalk-muted hover:text-chalk',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {/* Accent indicator: a chalk stroke above (phone) / beside (sidebar) the active tab. */}
                  <span
                    aria-hidden
                    className={cx(
                      'absolute top-0 h-[3px] w-10 rounded-full bg-accent transition-opacity md:top-2 md:bottom-2 md:left-0 md:h-auto md:w-[3px]',
                      isActive ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  <span className="relative">
                    {item.icon}
                    {item.badge && (
                      <span className="absolute -top-0.5 -right-1 size-2.5 rounded-full border-2 border-board-raised bg-pink" />
                    )}
                  </span>
                  {item.label}
                  {item.badge && <span className="sr-only">(new activity)</span>}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
