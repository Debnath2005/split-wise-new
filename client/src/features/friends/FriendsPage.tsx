import { useState } from 'react';
import { useAddFriend, useFriends } from '../../api/friends';
import { Alert } from '../../components/ui/Alert';
import { Avatar } from '../../components/ui/Avatar';
import { Badge } from '../../components/ui/Badge';
import { BalanceChip } from '../../components/ui/BalanceChip';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { List, ListRow } from '../../components/ui/ListRow';
import { PageHeader } from '../../components/ui/PageHeader';
import { Sheet } from '../../components/ui/Sheet';
import { PageSpinner } from '../../components/ui/Spinner';
import { Fab } from '../../components/ui/Fab';
import { PlusIcon } from '../../components/ui/icons';
import { AddExpenseSheet } from '../expenses/AddExpenseSheet';
import { SummaryHeader } from '../balances/SummaryHeader';
import { InviteLinkPanel } from '../invites/InviteLinkPanel';
import { PersonForm, contactOf } from '../people/PersonForm';

export function FriendsPage() {
  const friends = useFriends();
  const addFriend = useAddFriend();
  const [adding, setAdding] = useState(false);
  const [addingExpense, setAddingExpense] = useState(false);
  const [invitee, setInvitee] = useState<{ id: number; name: string } | null>(null);
  const closeAdd = () => {
    setAdding(false);
    setInvitee(null);
  };

  return (
    <>
      <PageHeader title="Friends">
        <Button variant="secondary" onClick={() => setAdding(true)}>
          <PlusIcon />
          Add friend
        </Button>
      </PageHeader>
      <SummaryHeader />

      {friends.isPending ? (
        <PageSpinner />
      ) : friends.isError ? (
        <Alert tone="error">{friends.error.message}</Alert>
      ) : friends.data.length === 0 ? (
        <EmptyState title="No friends yet">
          <p>Add someone to start splitting expenses.</p>
          <Button className="mt-4" onClick={() => setAdding(true)}>
            Add a friend
          </Button>
        </EmptyState>
      ) : (
        <List label="Friends">
          {friends.data.map((f) => (
            <ListRow
              key={f.id}
              to={`/friends/${f.id}`}
              leading={<Avatar name={f.name} placeholder={f.is_placeholder} />}
              title={
                <>
                  <span className="truncate">{f.name}</span>
                  {f.is_placeholder && <Badge>Invited</Badge>}
                </>
              }
              subtitle={contactOf(f)}
              trailing={<BalanceChip paise={f.balance_paise} perspective="friend" />}
            />
          ))}
        </List>
      )}

      <Sheet
        open={adding}
        onClose={closeAdd}
        title={invitee ? 'Friend added' : 'Add friend'}
        footer={
          invitee ? (
            <Button variant="secondary" fullWidth onClick={closeAdd}>
              Done
            </Button>
          ) : (
            <Button type="submit" form="add-friend" loading={addFriend.isPending} fullWidth>
              Add friend
            </Button>
          )
        }
      >
        {adding &&
          (invitee ? (
            // Someone without an account: offer a shareable invite link (ADR-0015).
            <InviteLinkPanel placeholderId={invitee.id} name={invitee.name} />
          ) : (
            <PersonForm
              formId="add-friend"
              submit={async (values) => {
                const { friend } = await addFriend.mutateAsync(values);
                if (friend.is_placeholder) setInvitee(friend);
              }}
              onDone={() => {
                if (!addFriend.data?.friend.is_placeholder) closeAdd();
              }}
            />
          ))}
      </Sheet>
      <Fab onClick={() => setAddingExpense(true)}>Add expense</Fab>
      <AddExpenseSheet open={addingExpense} onClose={() => setAddingExpense(false)} />
    </>
  );
}
