import type { ReactNode } from 'react';

export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-dashed border-yellow/70 px-2 py-0.5 text-sm font-medium text-yellow">
      {children}
    </span>
  );
}
