import { cx } from './cx';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? [parts[0]![0], parts.at(-1)![0]] : [parts[0]?.[0]];
  return letters.join('').toUpperCase() || '?';
}

/** Initials avatar. Placeholders (people who haven't signed up) get a dashed outline. */
export function Avatar({
  name,
  placeholder = false,
  size = 'md',
}: {
  name: string;
  placeholder?: boolean;
  size?: 'md' | 'lg';
}) {
  return (
    <span
      aria-hidden
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold',
        size === 'md' ? 'size-10 text-sm' : 'size-16 text-xl',
        placeholder
          ? 'border border-dashed border-gray-dark-2 bg-white text-gray-dark-2'
          : 'bg-brand-soft text-green-text',
      )}
    >
      {initials(name)}
    </span>
  );
}
