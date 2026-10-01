import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required: icon-only buttons need an accessible name. */
  label: string;
  children: ReactNode;
}

/** 44×44 icon-only button (DESIGN.md §10 tap targets). */
export function IconButton({
  label,
  children,
  className,
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cx(
        'inline-flex size-11 shrink-0 items-center justify-center rounded-control text-chalk hover:bg-chalk/10',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
