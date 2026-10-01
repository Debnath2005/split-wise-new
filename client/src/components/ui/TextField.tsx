import { forwardRef, useId, useState, type InputHTMLAttributes } from 'react';
import { cx } from './cx';

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label: string;
  hint?: string;
  error?: string;
  /** Adds a Show/Hide toggle; the input must be type="password". */
  revealable?: boolean;
}

/**
 * Labelled input. 16px text so iOS doesn't zoom, 44px tall (DESIGN.md §10).
 * Errors are linked with aria-describedby and announced.
 */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, revealable = false, type = 'text', className, readOnly, ...rest },
  ref,
) {
  const id = useId();
  const [revealed, setRevealed] = useState(false);
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ');

  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-semibold tracking-[0.01em]">
        {label}
      </label>
      <div className="relative">
        <input
          ref={ref}
          id={id}
          type={revealable && revealed ? 'text' : type}
          readOnly={readOnly}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          className={cx(
            'min-h-11 w-full rounded-control border bg-white px-3 text-base text-ink placeholder:text-gray-dark-2/70',
            error ? 'border-danger' : 'border-gray-light-1',
            readOnly && 'border-gray-light-3 bg-gray-light-3/50 text-gray-dark-2',
            revealable && 'pr-16',
          )}
          {...rest}
        />
        {revealable && (
          <button
            type="button"
            onClick={() => setRevealed((r) => !r)}
            aria-pressed={revealed}
            aria-label={revealed ? 'Hide password' : 'Show password'}
            className="absolute inset-y-0 right-0 min-w-14 rounded-r-control px-3 text-sm font-semibold text-link"
          >
            {revealed ? 'Hide' : 'Show'}
          </button>
        )}
      </div>
      {hint && !error && (
        <p id={`${id}-hint`} className="text-sm text-gray-dark-2">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
});
