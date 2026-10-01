import type { ReactNode } from 'react';
import { cx } from './cx';

const tones = {
  error: 'border-danger/40 bg-white text-danger',
  success: 'border-green-text/30 bg-brand-soft text-green-text',
};

export function Alert({ tone, children }: { tone: keyof typeof tones; children: ReactNode }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cx('rounded-control border px-3 py-2.5 text-sm', tones[tone])}
    >
      {children}
    </div>
  );
}
