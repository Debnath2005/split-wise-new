import { Navigate, Outlet, useLocation } from 'react-router';
import { useMe } from '../api/auth';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { PageSpinner } from '../components/ui/Spinner';

export interface FromState {
  from?: string;
}

function LoadError({ retry }: { retry: () => void }) {
  return (
    <div className="mx-auto flex max-w-sm flex-col gap-4 px-4 pt-16">
      <Alert tone="error">Couldn't reach the server. Check your connection.</Alert>
      <Button variant="secondary" onClick={retry}>
        Try again
      </Button>
    </div>
  );
}

/** Logged-out users are sent to /login, remembering where they were going. */
export function RequireAuth() {
  const me = useMe();
  const location = useLocation();
  if (me.isPending) return <PageSpinner />;
  if (me.isError) return <LoadError retry={() => void me.refetch()} />;
  if (!me.data) {
    const from = location.pathname + location.search;
    return <Navigate to="/login" replace state={{ from } satisfies FromState} />;
  }
  return <Outlet />;
}

/**
 * Login/signup pages bounce logged-in users into the app — to the page they were originally
 * heading for. This also runs right after a successful login, when the cached user appears.
 */
export function RedirectIfAuthed() {
  const me = useMe();
  const from = (useLocation().state as FromState | null)?.from ?? '/friends';
  if (me.isPending) return <PageSpinner />;
  if (me.data) return <Navigate to={from} replace />;
  return <Outlet />;
}
