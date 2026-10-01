import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import type { FriendDetailResponse } from '@split-wise/shared';
import { useRemoveFriend } from '../../api/balances';
import { useMe } from '../../api/auth';
import { useFriendExpenses } from '../../api/expenses';
import { useFriend } from '../../api/friends';
import { Alert } from '../../components/ui/Alert';
import { Avatar } from '../../components/ui/Avatar';
import { BackLink } from '../../components/ui/BackLink';
import { Badge } from '../../components/ui/Badge';
import { BalanceChip } from '../../components/ui/BalanceChip';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { List, ListRow } from '../../components/ui/ListRow';
import { Fab } from '../../components/ui/Fab';
import { Money } from '../../components/ui/Money';
import { Sheet } from '../../components/ui/Sheet';
import { PageSpinner } from '../../components/ui/Spinner';
import { AddExpenseSheet } from '../expenses/AddExpenseSheet';
import { ExpenseList } from '../expenses/ExpenseList';
import { contactOf } from '../people/PersonForm';

/** Total with this friend, then one row per group (and non-group) — SPEC §6 friend screen. */
function BalanceCard({
  name,
  balance,
}: {
  name: string;
  balance: FriendDetailResponse['balance'];
}) {
  const total = balance.total_paise;
  return (
    <Card title="Balance">
      <p className="text-2xl">
        {total === 0 ? (
          <span className="text-chalk-muted">You're all settled up with {name}.</span>
        ) : total > 0 ? (
          <span className="text-positive">
            {name} owes you <Money paise={total} className="font-semibold" />
          </span>
        ) : (
          <span className="text-negative">
            You owe {name} <Money paise={-total} className="font-semibold" />
          </span>
        )}
      </p>
      {balance.by_scope.length > 0 && (
        <ul className="mt-4 divide-y divide-dashed divide-line border-t-[1.5px] border-dashed border-line">
          {balance.by_scope.map((s) => (
            <li
              key={s.group?.id ?? 'none'}
              className="flex min-h-12 items-center justify-between gap-3 py-2"
            >
              <span className="truncate">{s.group ? s.group.name : 'Non-group expenses'}</span>
              <BalanceChip paise={s.balance_paise} perspective="friend" />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Confirm sheet for unfriending; explains why when the server blocks it (shared group / balance). */
function RemoveFriendSheet({
  friendId,
  name,
  open,
  onClose,
}: {
  friendId: number;
  name: string;
  open: boolean;
  onClose: () => void;
}) {
  const remove = useRemoveFriend(friendId);
  const navigate = useNavigate();
  return (
    <Sheet
      open={open}
      onClose={() => {
        remove.reset();
        onClose();
      }}
      title={`Remove ${name}?`}
      footer={
        <Button
          fullWidth
          loading={remove.isPending}
          onClick={() =>
            remove.mutate(undefined, { onSuccess: () => navigate('/friends', { replace: true }) })
          }
        >
          Remove friend
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <p>
          {name} will disappear from your friends list. Your shared expenses stay as they are. You
          can only remove a friend once you're settled up and don't share a group.
        </p>
        {remove.isError && <Alert tone="error">{remove.error.message}</Alert>}
      </div>
    </Sheet>
  );
}

export function FriendDetailPage() {
  const id = Number(useParams().userId);
  const query = useFriend(id);
  const expenses = useFriendExpenses(id);
  const { data: me } = useMe();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState(false);

  if (query.isPending) return <PageSpinner />;
  if (query.isError) {
    return (
      <>
        <BackLink to="/friends">Friends</BackLink>
        <Alert tone="error">{query.error.message}</Alert>
      </>
    );
  }
  const { friend, shared_groups: groups } = query.data;

  return (
    <>
      <BackLink to="/friends">Friends</BackLink>
      <div className="flex flex-col gap-4">
        <Card>
          <div className="flex items-center gap-4">
            <Avatar name={friend.name} placeholder={friend.is_placeholder} size="lg" />
            <div className="min-w-0">
              <h1 className="flex items-center gap-2 text-3xl/tight font-semibold">
                <span className="truncate">{friend.name}</span>
                {friend.is_placeholder && <Badge>Invited</Badge>}
              </h1>
              <p className="truncate text-lg text-chalk-muted">{contactOf(friend)}</p>
            </div>
          </div>
          {friend.is_placeholder && (
            <p className="mt-4 text-lg text-chalk-muted">
              {friend.name} hasn't joined yet. When they sign up with this email or phone, they'll
              see everything you've shared with them.
            </p>
          )}
        </Card>

        <BalanceCard name={friend.name} balance={query.data.balance} />

        <section>
          <h2 className="mb-2 text-3xl/tight font-semibold">Shared groups</h2>
          {groups.length === 0 ? (
            <EmptyState title="No shared groups" />
          ) : (
            <List label="Shared groups">
              {groups.map((g) => (
                <ListRow
                  key={g.id}
                  to={`/groups/${g.id}`}
                  title={g.name}
                  subtitle={`${g.member_count} members`}
                />
              ))}
            </List>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-3xl/tight font-semibold">Expenses</h2>
          <ExpenseList
            query={expenses}
            meId={me?.id ?? 0}
            showGroup
            emptyText={`Nothing shared with ${friend.name} yet.`}
          />
        </section>

        <Button variant="secondary" onClick={() => setRemoving(true)}>
          Remove friend
        </Button>
      </div>
      <RemoveFriendSheet
        friendId={id}
        name={friend.name}
        open={removing}
        onClose={() => setRemoving(false)}
      />
      <Fab onClick={() => setAdding(true)}>Add expense</Fab>
      <AddExpenseSheet open={adding} onClose={() => setAdding(false)} context={{ friendId: id }} />
    </>
  );
}
