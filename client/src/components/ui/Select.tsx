import { useId, type SelectHTMLAttributes } from 'react';
import { cx } from './cx';

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  label: string;
  options: { value: string; label: string }[];
  error?: string;
}

/** Native select (best on phones), styled to match TextField: 16px text, 44px tall. */
export function Select({ label, options, error, className, ...rest }: SelectProps) {
  const id = useId();
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-semibold tracking-[0.01em]">
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={cx(
            'min-h-11 w-full appearance-none rounded-control border bg-white pr-10 pl-3 text-base text-ink',
            error ? 'border-danger' : 'border-gray-light-1',
          )}
          {...rest}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          className="pointer-events-none absolute inset-y-0 right-3 my-auto size-5 text-gray-dark-2"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
