import { cx } from './cx';

/** A shimmering placeholder block (DESIGN.md: skeletons, never circular spinners). */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cx('skeleton block', className)} />;
}

/** Whole-page loading state: a few shimmering rows shaped like a list. */
export function PageSpinner() {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col gap-3 py-2">
      <Skeleton className="h-9 w-2/5" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="h-3 w-2/5" />
          </div>
        </div>
      ))}
    </div>
  );
}
