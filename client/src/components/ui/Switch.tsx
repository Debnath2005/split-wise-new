import { useId } from 'react';
import { cx } from './cx';

interface SwitchProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

/** An on/off setting: a full-width 44px+ row with a chalk-blue track (role="switch"). */
export function Switch({ label, description, checked, onChange, disabled }: SwitchProps) {
  const id = useId();
  return (
    <div className="flex min-h-12 items-center justify-between gap-4">
      <span className="min-w-0">
        <label htmlFor={id} className="block font-semibold">
          {label}
        </label>
        {description && (
          <span id={`${id}-desc`} className="block text-sm text-chalk-muted">
            {description}
          </span>
        )}
      </span>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={description ? `${id}-desc` : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border-[1.5px] transition-colors disabled:opacity-50',
          checked ? 'border-accent bg-accent' : 'border-line-strong bg-board-sunken',
        )}
      >
        <span
          aria-hidden
          className={cx(
            'inline-block size-6 rounded-full shadow-card transition-transform',
            checked ? 'translate-x-6 bg-slate' : 'translate-x-1 bg-chalk-muted',
          )}
        />
      </button>
    </div>
  );
}
