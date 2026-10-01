import type { ReactNode } from 'react';
import { PlusIcon } from './icons';

/**
 * Floating primary action (SPEC §11 "+ Add expense"): above the bottom tab bar and safe area on
 * phones, bottom-right on larger screens. z-index follows DESIGN.md's sticky layer (100).
 */
export function Fab({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="chalk-press fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-[100] inline-flex min-h-14 items-center gap-2 rounded-full border-[1.5px] border-accent bg-accent px-5 text-xl font-semibold text-slate shadow-overlay hover:bg-accent-strong md:right-8 md:bottom-8"
    >
      <PlusIcon />
      {children}
    </button>
  );
}
