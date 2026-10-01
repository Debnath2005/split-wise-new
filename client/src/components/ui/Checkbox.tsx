import type { ReactNode } from 'react';

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}

/** A full-width, 44px+ tappable checkbox row. */
export function Checkbox({ checked, onChange, children }: CheckboxProps) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center gap-3 py-1">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-5 shrink-0 accent-green-text"
      />
      <span className="flex min-w-0 flex-1 items-center gap-3">{children}</span>
    </label>
  );
}
