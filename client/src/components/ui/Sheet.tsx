import { useEffect, useRef, type ReactNode } from 'react';
import { IconButton } from './IconButton';
import { CloseIcon } from './icons';
import { cx } from './cx';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** "bottom" for short forms, "full" for long ones (SPEC §11). Both become a centered panel ≥768px. */
  variant?: 'bottom' | 'full';
  /** Pinned below the scrolling content, e.g. the submit button. */
  footer?: ReactNode;
  children: ReactNode;
}

/**
 * Modal sheet on the native <dialog>: focus is trapped and restored, Esc closes, the rest of the
 * page is inert. Tapping the backdrop closes it too.
 */
export function Sheet({ open, onClose, title, variant = 'bottom', footer, children }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = 'hidden';
    return () => {
      root.style.overflow = previous;
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className={cx(
        'm-0 flex-col bg-white p-0 text-ink backdrop:bg-ink/50 open:flex',
        'max-w-none shadow-overlay',
        variant === 'bottom'
          ? 'mt-auto max-h-[90dvh] w-full rounded-t-panel'
          : 'h-dvh max-h-none w-full',
        'md:m-auto md:h-fit md:max-h-[85dvh] md:w-full md:max-w-lg md:rounded-panel',
      )}
    >
      <header className="flex items-center justify-between gap-2 border-b border-gray-light-3 py-2 pr-2 pl-5 pt-[max(0.5rem,env(safe-area-inset-top))] md:pt-2">
        <h2 className="text-xl/tight font-semibold">{title}</h2>
        <IconButton label="Close" onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </header>
      <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-5">{children}</div>
      {footer && (
        <div className="border-t border-gray-light-3 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {footer}
        </div>
      )}
    </dialog>
  );
}
