import { useId, type ReactNode } from 'react';
import { cx } from './cx';

interface Tab<T extends string> {
  value: T;
  label: string;
}

interface TabsProps<T extends string> {
  tabs: Tab<T>[];
  value: T;
  onChange: (value: T) => void;
  children: ReactNode;
}

/** Segmented tabs; `children` is the panel for the selected tab. */
export function Tabs<T extends string>({ tabs, value, onChange, children }: TabsProps<T>) {
  const id = useId();
  return (
    <div>
      <div
        role="tablist"
        className="mb-4 grid auto-cols-fr grid-flow-col rounded-control bg-board-sunken p-1"
      >
        {tabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            id={`${id}-${tab.value}`}
            aria-selected={tab.value === value}
            aria-controls={`${id}-panel`}
            onClick={() => onChange(tab.value)}
            className={cx(
              'min-h-10 rounded-[6px] text-xl font-semibold transition-colors',
              tab.value === value ? 'bg-board-raised text-accent shadow-card' : 'text-chalk-muted',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${value}`}>
        {children}
      </div>
    </div>
  );
}
