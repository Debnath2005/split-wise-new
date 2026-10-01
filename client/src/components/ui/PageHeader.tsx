import type { ReactNode } from 'react';

/** Page title (DESIGN.md H1: 32px / 700). */
export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="mb-6 flex items-center justify-between gap-4">
      <h1 className="text-[32px]/tight font-bold tracking-[-0.01em]">{title}</h1>
      {children}
    </header>
  );
}
