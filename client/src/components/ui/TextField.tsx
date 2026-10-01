import { forwardRef, useId, useState, type InputHTMLAttributes } from 'react';
import { cx } from './cx';

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label: string;
  hint?: string;
  error?: string;
  /** Adds a Show/Hide toggle; the input must be type="password". */
  revealable?: boolean;
  /** Fixed text before the value, e.g. "₹". */
  prefix?: string;
  /** Fixed text after the value, e.g. "%". */
  suffix?: string;
  /** "lg" for the headline amount field. */
  size?: 'md' | 'lg';
  /** Visually hide the label (it stays available to screen readers). */
  hideLabel?: boolean;
}

/**
 * Labelled input. 16px text so iOS doesn't zoom, 44px tall (DESIGN.md §10).
 * Errors are linked with aria-describedby and announced.
 */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  {
    label,
    hint,
    error,
    revealable = false,
    prefix,
    suffix,
    size = 'md',
    hideLabel = false,
    type = 'text',
    className,
    readOnly,
    ...rest
  },
  ref,
) {
  const id = useId();
  const [revealed, setRevealed] = useState(false);
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ');

  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label
        htmlFor={id}
        className={cx('text-lg font-medium tracking-[0.02em]', hideLabel && 'sr-only')}
      >
        {label}
      </label>
      <div className="relative">
        {prefix && (
          <span
            aria-hidden
            className={cx(
              'pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-chalk-muted',
              size === 'lg' ? 'text-2xl' : 'text-base',
            )}
          >
            {prefix}
          </span>
        )}
        <input
          ref={ref}
          id={id}
          type={revealable && revealed ? 'text' : type}
          readOnly={readOnly}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          className={cx(
            'min-h-11 w-full rounded-control border bg-board-sunken px-3 text-xl text-chalk placeholder:text-chalk-muted/60',
            size === 'lg' && 'money min-h-14 text-2xl font-semibold',
            prefix && (size === 'lg' ? 'pl-9' : 'pl-7'),
            suffix && 'pr-8',
            error ? 'border-danger' : 'border-line-strong',
            readOnly && 'border-line bg-board-sunken/60 text-chalk-muted',
            revealable && 'pr-16',
          )}
          {...rest}
        />
        {suffix && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-chalk-muted"
          >
            {suffix}
          </span>
        )}
        {revealable && (
          <button
            type="button"
            onClick={() => setRevealed((r) => !r)}
            aria-pressed={revealed}
            aria-label={revealed ? 'Hide password' : 'Show password'}
            className="absolute inset-y-0 right-0 min-w-14 rounded-r-control px-3 text-lg font-semibold text-accent"
          >
            {revealed ? 'Hide' : 'Show'}
          </button>
        )}
      </div>
      {hint && !error && (
        <p id={`${id}-hint`} className="text-lg text-chalk-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-lg text-danger">
          {error}
        </p>
      )}
    </div>
  );
});
