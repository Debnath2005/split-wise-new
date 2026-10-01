const pad = (n: number) => String(n).padStart(2, '0');

/** Today's date in the user's own timezone as "YYYY-MM-DD" (not UTC, which can be a day off in IST). */
export function todayLocal(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
}

/** "1 Oct", or "1 Oct 2025" when it isn't the current year. */
export function formatShortDate(iso: string, now = new Date()): string {
  const date = parseIsoDate(iso);
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    ...(date.getFullYear() !== now.getFullYear() && { year: 'numeric' }),
  });
}

/** "1 October 2026". */
export function formatLongDate(iso: string): string {
  return parseIsoDate(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** Day and month parts for a date badge: { day: "1", month: "Oct" }. */
export function dateBadge(iso: string): { day: string; month: string } {
  const date = parseIsoDate(iso);
  return {
    day: String(date.getDate()),
    month: date.toLocaleDateString('en-IN', { month: 'short' }),
  };
}

/** "just now", "5m ago", "3h ago", "yesterday", then a short date. */
export function formatRelative(ms: number, now = Date.now()): string {
  const minutes = Math.floor((now - ms) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  if (hours < 48) return 'yesterday';
  const d = new Date(ms);
  return formatShortDate(todayLocal(d), new Date(now));
}
