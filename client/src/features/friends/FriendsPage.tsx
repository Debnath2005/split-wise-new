import { useState } from 'react';
import { useAddFriend, useFriends } from '../../api/friends';
import { Alert } from '../../components/ui/Alert';
import { Avatar } from '../../components/ui/Avatar';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { List, ListRow } from '../../components/ui/ListRow';
import { PageHeader } from '../../components/ui/PageHeader';
import { Sheet } from '../../components/ui/Sheet';
import { PageSpinner } from '../../components/ui/Spinner';
import { PlusIcon } from '../../components/ui/icons';
import { PersonForm, contactOf } from '../people/PersonForm';

export function FriendsPage() {
  const friends = useFriends();
  const addFriend = useAddFriend();
  const [adding, setAdding] = useState(false);

  return (
    <>
      <PageHeader title="Friends">
        <Button variant="secondary" onClick={() => setAdding(true)}>
          <PlusIcon />
          Add friend
        </Button>
      </PageHeader>

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
            />
          ))}
        </List>
      )}

      <Sheet
        open={adding}
        onClose={() => setAdding(false)}
        title="Add friend"
        footer={
          <Button type="submit" form="add-friend" loading={addFriend.isPending} fullWidth>
            Add friend
          </Button>
        }
      >
        {adding && (
          <PersonForm
            formId="add-friend"
            submit={(values) => addFriend.mutateAsync(values)}
            onDone={() => setAdding(false)}
          />
        )}
      </Sheet>
    </>
  );
}
