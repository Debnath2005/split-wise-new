import { useState } from 'react';
import { useParams } from 'react-router';
import { useMe } from '../../api/auth';
import { useFriendExpenses } from '../../api/expenses';
import { useFriend } from '../../api/friends';
import { Alert } from '../../components/ui/Alert';
import { Avatar } from '../../components/ui/Avatar';
import { BackLink } from '../../components/ui/BackLink';
import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { List, ListRow } from '../../components/ui/ListRow';
import { Fab } from '../../components/ui/Fab';
import { PageSpinner } from '../../components/ui/Spinner';
import { AddExpenseSheet } from '../expenses/AddExpenseSheet';
import { ExpenseList } from '../expenses/ExpenseList';
import { contactOf } from '../people/PersonForm';

export function FriendDetailPage() {
  const id = Number(useParams().userId);
  const query = useFriend(id);
  const expenses = useFriendExpenses(id);
  const { data: me } = useMe();
  const [adding, setAdding] = useState(false);

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
              <h1 className="flex items-center gap-2 text-2xl/tight font-semibold">
                <span className="truncate">{friend.name}</span>
                {friend.is_placeholder && <Badge>Invited</Badge>}
              </h1>
              <p className="truncate text-sm text-gray-dark-2">{contactOf(friend)}</p>
            </div>
          </div>
          {friend.is_placeholder && (
            <p className="mt-4 text-sm text-gray-dark-2">
              {friend.name} hasn't joined yet. When they sign up with this email or phone, they'll
              see everything you've shared with them.
            </p>
          )}
        </Card>

        <section>
          <h2 className="mb-2 text-xl/tight font-semibold">Shared groups</h2>
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
          <h2 className="mb-2 text-xl/tight font-semibold">Expenses</h2>
          <ExpenseList
            query={expenses}
            meId={me?.id ?? 0}
            showGroup
            emptyText={`Nothing shared with ${friend.name} yet.`}
          />
        </section>
      </div>
      <Fab onClick={() => setAdding(true)}>Add expense</Fab>
      <AddExpenseSheet open={adding} onClose={() => setAdding(false)} context={{ friendId: id }} />
    </>
  );
}
