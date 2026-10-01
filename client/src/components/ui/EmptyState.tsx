import type { ReactNode } from 'react';

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-card border border-dashed border-gray-light-1 px-6 py-12 text-center">
      <h2 className="text-xl/tight font-semibold">{title}</h2>
      {children && <div className="mt-2 text-sm text-gray-dark-2">{children}</div>}
    </div>
  );
}
