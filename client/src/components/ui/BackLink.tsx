import { Link } from 'react-router';
import { BackIcon } from './icons';

export function BackLink({ to, children }: { to: string; children: string }) {
  return (
    <Link
      to={to}
      className="-ml-2 mb-2 inline-flex min-h-11 items-center gap-1 rounded-control px-2 text-sm font-semibold text-link"
    >
      <BackIcon />
      {children}
    </Link>
  );
}
