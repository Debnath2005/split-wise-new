import type { ReactNode } from 'react';

/** Hand-drawn chalk doodle used when no icon is given. */
const ChalkDoodle = () => (
  <svg
    viewBox="0 0 48 48"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className="size-12"
    aria-hidden
  >
    <path d="M8 38c4-1 28-1 32 0M12 34l2-20c.2-1.5 1.4-2.6 3-2.6h14c1.6 0 2.8 1.1 3 2.6l2 20" />
    <path d="M19 20h10M18 26h12" strokeDasharray="2 3" />
  </svg>
);

/** DESIGN.md: icon-based composition with descriptive text and (optionally) an action. */
export function EmptyState({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="animate-chalk-in flex flex-col items-center rounded-card border-[1.5px] border-dashed border-line-strong px-6 py-10 text-center">
      <span className="mb-3 text-accent">{icon ?? <ChalkDoodle />}</span>
      <h2 className="text-3xl/tight font-bold">{title}</h2>
      {children && <div className="mt-2 text-lg text-chalk-muted">{children}</div>}
    </div>
  );
}
