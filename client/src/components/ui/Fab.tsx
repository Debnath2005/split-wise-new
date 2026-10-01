import type { ReactNode } from 'react';
import { PlusIcon } from './icons';

/**
 * Floating primary action (SPEC §11 "+ Add expense"): sits above the bottom tab bar and the
 * safe area on phones, bottom-right on larger screens.
 */
export function Fab({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 inline-flex min-h-14 items-center gap-2 rounded-full border border-brand bg-brand px-5 text-sm font-semibold text-ink shadow-overlay hover:border-brand-dark hover:bg-brand-dark md:right-8 md:bottom-8"
    >
      <PlusIcon />
      {children}
    </button>
  );
}
