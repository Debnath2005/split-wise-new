import type { ReactNode } from 'react';

interface CardProps {
  title?: string;
  children: ReactNode;
}

/** DESIGN.md §4 "Card": white surface, light border, 16px radius, 24px padding. */
export function Card({ title, children }: CardProps) {
  return (
    <section className="rounded-card border border-gray-light-3 bg-white p-6">
      {title && <h2 className="mb-4 text-xl/tight font-semibold">{title}</h2>}
      {children}
    </section>
  );
}
