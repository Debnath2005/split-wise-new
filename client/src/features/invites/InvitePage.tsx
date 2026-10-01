import { Link, useNavigate, useParams } from 'react-router';
import { useMe } from '../../api/auth';
import { useAcceptInvite, useInvitePreview } from '../../api/invites';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { PageSpinner } from '../../components/ui/Spinner';
import { AuthLayout } from '../auth/AuthLayout';

/**
 * /invite/:token (ADR-0015). Logged out: sign up through the link (claims the invited history) or
 * log in first. Logged in: accept, which merges the invited history into this account.
 */
export function InvitePage() {
  const token = useParams().token ?? '';
  const navigate = useNavigate();
  const me = useMe();
  const preview = useInvitePreview(token);
  const accept = useAcceptInvite(token);

  if (preview.isPending || me.isPending) return <PageSpinner />;
  if (preview.isError || !preview.data.valid) {
    return (
      <AuthLayout title="Invite expired">
        <p>This invite link has already been used or has expired. Ask your friend for a new one.</p>
        <Link to="/friends" className="mt-4 inline-block font-semibold text-accent">
          Go to Split-wise
        </Link>
      </AuthLayout>
    );
  }
  const { inviter_name: inviter, invitee_name: invitee } = preview.data;
  const here = `/invite/${token}`;

  if (!me.data) {
    const signup = `/signup?${new URLSearchParams({ invite: token, name: invitee })}`;
    return (
      <AuthLayout title={`${inviter} invited you`}>
        <div className="flex flex-col gap-4">
          <p>
            {inviter} added you to Split-wise as <span className="font-semibold">{invitee}</span>.
            Create an account to see the expenses and groups you share.
          </p>
          <Button fullWidth onClick={() => navigate(signup, { state: { from: '/friends' } })}>
            Create account
          </Button>
          <Button
            variant="secondary"
            fullWidth
            onClick={() => navigate('/login', { state: { from: here } })}
          >
            I already have an account
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={`${inviter} invited you`}>
      <div className="flex flex-col gap-4">
        <p>
          {inviter} added you as <span className="font-semibold">{invitee}</span>. Accepting moves
          everything shared with {invitee} — expenses, groups and balances — into your account,{' '}
          <span className="font-semibold">{me.data.name}</span>.
        </p>
        {accept.isError && <Alert tone="error">{accept.error.message}</Alert>}
        <Button
          fullWidth
          loading={accept.isPending}
          onClick={() =>
            accept.mutate(undefined, { onSuccess: () => navigate('/friends', { replace: true }) })
          }
        >
          Accept invite
        </Button>
        <Link to="/friends" className="text-center font-semibold text-accent">
          Not now
        </Link>
      </div>
    </AuthLayout>
  );
}
