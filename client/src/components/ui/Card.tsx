import type { ReactNode } from 'react';

/** Chalk card: raised board surface, hand-drawn dashed border, subtle shadow (DESIGN.md). */
export function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="animate-chalk-in rounded-card border-[1.5px] border-dashed border-line-strong bg-board-raised p-5 shadow-card">
      {title && <h2 className="mb-4 text-3xl/tight font-bold">{title}</h2>}
      {children}
    </section>
  );
}
