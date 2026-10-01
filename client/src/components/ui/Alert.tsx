import type { ReactNode } from 'react';
import { cx } from './cx';

const tones = {
  error: 'border-danger/60 bg-board-sunken text-danger',
  success: 'border-positive/50 bg-board-sunken text-positive',
};

export function Alert({ tone, children }: { tone: keyof typeof tones; children: ReactNode }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cx(
        'rounded-control border-[1.5px] border-dashed px-3 py-2.5 text-base',
        tones[tone],
      )}
    >
      {children}
    </div>
  );
}
