import { useState } from 'react';
import { useGroups } from '../../api/groups';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { List, ListRow } from '../../components/ui/ListRow';
import { PageHeader } from '../../components/ui/PageHeader';
import { PageSpinner } from '../../components/ui/Spinner';
import { Fab } from '../../components/ui/Fab';
import { PlusIcon } from '../../components/ui/icons';
import { AddExpenseSheet } from '../expenses/AddExpenseSheet';
import { CreateGroupSheet } from './CreateGroupSheet';

export function GroupsPage() {
  const groups = useGroups();
  const [creating, setCreating] = useState(false);
  const [addingExpense, setAddingExpense] = useState(false);

  return (
    <>
      <PageHeader title="Groups">
        <Button variant="secondary" onClick={() => setCreating(true)}>
          <PlusIcon />
          New group
        </Button>
      </PageHeader>

      {groups.isPending ? (
        <PageSpinner />
      ) : groups.isError ? (
        <Alert tone="error">{groups.error.message}</Alert>
      ) : groups.data.length === 0 ? (
        <EmptyState title="No groups yet">
          <p>Create a group for a trip, your flat, or anything you share.</p>
          <Button className="mt-4" onClick={() => setCreating(true)}>
            Create a group
          </Button>
        </EmptyState>
      ) : (
        <List label="Groups">
          {groups.data.map((g) => (
            <ListRow
              key={g.id}
              to={`/groups/${g.id}`}
              title={<span className="truncate">{g.name}</span>}
              subtitle={`${g.member_count} ${g.member_count === 1 ? 'member' : 'members'}`}
            />
          ))}
        </List>
      )}

      <CreateGroupSheet open={creating} onClose={() => setCreating(false)} />
      <Fab onClick={() => setAddingExpense(true)}>Add expense</Fab>
      <AddExpenseSheet open={addingExpense} onClose={() => setAddingExpense(false)} />
    </>
  );
}
