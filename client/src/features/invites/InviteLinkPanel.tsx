import { useEffect, useRef, useState } from 'react';
import { inviteUrl, useCreateInvite } from '../../api/invites';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Spinner';
import { TextField } from '../../components/ui/TextField';
import { copyText } from '../../lib/clipboard';
import { formatLongDate, todayLocal } from '../../lib/dates';

/**
 * A shareable invite link for someone who hasn't joined yet (ADR-0015). Creating it replaces any
 * earlier link. Share uses the phone's share sheet when available (HTTPS); Copy always works.
 */
export function InviteLinkPanel({ placeholderId, name }: { placeholderId: number; name: string }) {
  const create = useCreateInvite(placeholderId);
  const { mutate } = create;
  const input = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState<'yes' | 'select' | null>(null);

  useEffect(() => mutate(), [mutate]);

  const url = create.data ? inviteUrl(create.data.token) : null;
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-xl font-bold">Invite {name}</h3>
      <p className="text-chalk-muted">
        Send this link so {name} can join and see everything you've shared. It works once.
      </p>
      {create.isError && <Alert tone="error">{create.error.message}</Alert>}
      {!url ? (
        <Skeleton className="h-11 w-full" />
      ) : (
        <>
          <TextField ref={input} label="Invite link" hideLabel value={url} readOnly />
          <div className="grid grid-cols-2 gap-3">
            {canShare && (
              <Button
                onClick={() =>
                  void navigator
                    .share({
                      title: 'Join me on Split-wise',
                      text: `Join me on Split-wise to split expenses`,
                      url,
                    })
                    .catch(() => undefined)
                }
              >
                Share
              </Button>
            )}
            <Button
              variant={canShare ? 'secondary' : 'primary'}
              className={canShare ? '' : 'col-span-2'}
              onClick={() =>
                void copyText(url, input.current).then((ok) => setCopied(ok ? 'yes' : 'select'))
              }
            >
              Copy link
            </Button>
          </div>
          {copied && (
            <p className="text-sm text-chalk-muted">
              {copied === 'yes' ? 'Copied.' : 'Selected — use your phone’s Copy.'}
            </p>
          )}
          {create.data && (
            <p className="text-sm text-chalk-muted">
              Valid until {formatLongDate(todayLocal(new Date(create.data.expires_at)))}.
            </p>
          )}
        </>
      )}
    </section>
  );
}
