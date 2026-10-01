import { forwardRef, useId, type TextareaHTMLAttributes } from 'react';
import { cx } from './cx';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, className, rows = 3, ...rest },
  ref,
) {
  const id = useId();
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-lg font-medium tracking-[0.02em]">
        {label}
      </label>
      <textarea
        ref={ref}
        id={id}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cx(
          'w-full rounded-control border bg-board-sunken px-3 py-2.5 text-xl text-chalk',
          error ? 'border-danger' : 'border-line-strong',
        )}
        {...rest}
      />
      {error && (
        <p id={`${id}-error`} role="alert" className="text-lg text-danger">
          {error}
        </p>
      )}
    </div>
  );
});
