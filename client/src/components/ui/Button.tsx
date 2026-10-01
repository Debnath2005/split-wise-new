import type { ButtonHTMLAttributes } from 'react';
import { Spinner } from './Spinner';
import { cx } from './cx';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary';
  loading?: boolean;
  fullWidth?: boolean;
}

const variants = {
  // DESIGN.md §4, adapted per §10: ink text stays on hover (white on #13AA52 fails contrast).
  primary: 'border-brand bg-brand text-ink hover:border-brand-dark hover:bg-brand-dark',
  secondary: 'border-gray-light-1 bg-white text-ink hover:bg-gray-light-3',
};

/** 44px minimum height (DESIGN.md §10). Shows a spinner and blocks clicks while `loading`. */
export function Button({
  variant = 'primary',
  loading = false,
  fullWidth = false,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-control border px-4 text-sm leading-none font-semibold tracking-[0.01em] transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-60',
        variants[variant],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading && <Spinner className="size-4" />}
      {children}
    </button>
  );
}
