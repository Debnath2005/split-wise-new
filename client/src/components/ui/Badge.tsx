import type { ReactNode } from 'react';

export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-gray-light-3 px-2 py-0.5 text-xs font-semibold text-gray-dark-2">
      {children}
    </span>
  );
}
