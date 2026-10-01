import type { ButtonHTMLAttributes } from 'react';
import { cx } from './cx';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary';
  loading?: boolean;
  fullWidth?: boolean;
}

const variants = {
  // DESIGN.md: accent fill, Deep Slate text (10.3:1), weight 600; hover ≈8% darker + lift.
  primary: 'border-accent bg-accent text-slate hover:border-accent-strong hover:bg-accent-strong',
  // Ghost: 1.5px chalk outline, chalk text, subtle fill on hover.
  secondary: 'border-line-strong bg-transparent text-chalk hover:bg-chalk/10',
};

/** Chalk "…" shown while busy — DESIGN.md forbids circular spinners. */
function BusyDots() {
  return (
    <span aria-hidden className="chalk-dots inline-flex gap-0.5">
      <span>•</span>
      <span>•</span>
      <span>•</span>
    </span>
  );
}

/** 44px minimum height (DESIGN.md adaptations). Shows animated dots and blocks clicks while `loading`. */
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
        'chalk-press inline-flex min-h-11 items-center justify-center gap-2 rounded-control border-[1.5px] px-4 text-lg leading-none font-semibold',
        'disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {children}
      {loading && <BusyDots />}
    </button>
  );
}
