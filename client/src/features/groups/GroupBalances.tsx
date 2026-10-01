import { useState } from 'react';
import { useGroupBalances } from '../../api/balances';
import { Alert } from '../../components/ui/Alert';
import { Avatar } from '../../components/ui/Avatar';
import { BalanceChip } from '../../components/ui/BalanceChip';
import { EmptyState } from '../../components/ui/EmptyState';
import { List, ListRow } from '../../components/ui/ListRow';
import { Money } from '../../components/ui/Money';
import { Button } from '../../components/ui/Button';
import { PageSpinner } from '../../components/ui/Spinner';
import { SettleUpSheet, type SettleOption } from '../settle/SettleUpSheet';

/**
 * Group Balances tab (SPEC §11.5): each member's net, then who pays whom. Numbers come straight
 * from GET /groups/:id/balances — the client only formats them. "Settle" buttons arrive in M6.
 */
export function GroupBalances({
  groupId,
  groupName,
  meId,
}: {
  groupId: number;
  groupName: string;
  meId: number;
}) {
  const query = useGroupBalances(groupId);
  const [settling, setSettling] = useState<SettleOption | null>(null);
  if (query.isPending) return <PageSpinner />;
  if (query.isError) return <Alert tone="error">{query.error.message}</Alert>;

  const { members, transfers, simplified } = query.data;
  const name = (p: { id: number; name: string }) => (p.id === meId ? 'You' : p.name);

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="mb-1 text-2xl/tight font-bold">Who pays whom</h2>
        <p className="mb-2 text-sm text-chalk-muted">
          {simplified
            ? 'Simplified so fewer payments are needed. Turn it off in group settings.'
            : 'Each pair settles directly. Turn on Simplify debts in group settings for fewer payments.'}
        </p>
        {transfers.length === 0 ? (
          <EmptyState title="All settled up">Nobody owes anything in this group.</EmptyState>
        ) : (
          <List label="Who pays whom">
            {transfers.map((t) => {
              const involvesMe = t.from.id === meId || t.to.id === meId;
              return (
                <ListRow
                  key={`${t.from.id}-${t.to.id}`}
                  leading={<Avatar name={t.from.name} placeholder={t.from.is_placeholder} />}
                  title={
                    <span className="truncate">
                      {name(t.from)} {t.from.id === meId ? 'owe' : 'owes'} {name(t.to)}
                    </span>
                  }
                  trailing={
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <Money
                        paise={t.amount_paise}
                        className={`font-semibold ${
                          t.from.id === meId
                            ? 'text-negative'
                            : t.to.id === meId
                              ? 'text-positive'
                              : ''
                        }`}
                      />
                      {/* SPEC §11.5: each suggested transfer gets a Settle button. */}
                      <Button
                        variant="secondary"
                        aria-label={`Settle ${name(t.from)} to ${name(t.to)}`}
                        onClick={() =>
                          setSettling({
                            from: t.from,
                            to: t.to,
                            amountPaise: t.amount_paise,
                            group: { id: groupId, name: groupName },
                          })
                        }
                      >
                        Settle
                      </Button>
                    </span>
                  }
                  subtitle={involvesMe ? undefined : 'between them'}
                />
              );
            })}
          </List>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-2xl/tight font-bold">Everyone's balance</h2>
        <List label="Member balances">
          {members.map((m) => (
            <ListRow
              key={m.user.id}
              leading={<Avatar name={m.user.name} placeholder={m.user.is_placeholder} />}
              title={
                <span className="truncate">
                  {m.user.id === meId ? `${m.user.name} (you)` : m.user.name}
                </span>
              }
              trailing={<BalanceChip paise={m.net_paise} perspective="member" />}
            />
          ))}
        </List>
      </section>
      <SettleUpSheet
        open={settling !== null}
        onClose={() => setSettling(null)}
        options={settling ? [settling] : []}
      />
    </div>
  );
}
