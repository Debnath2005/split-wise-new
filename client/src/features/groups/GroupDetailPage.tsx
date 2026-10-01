import { useState } from 'react';
import { useParams } from 'react-router';
import { useMe } from '../../api/auth';
import { useGroupExpenses } from '../../api/expenses';
import { useGroup } from '../../api/groups';
import { Alert } from '../../components/ui/Alert';
import { BackLink } from '../../components/ui/BackLink';
import { EmptyState } from '../../components/ui/EmptyState';
import { IconButton } from '../../components/ui/IconButton';
import { PageSpinner } from '../../components/ui/Spinner';
import { Tabs } from '../../components/ui/Tabs';
import { Fab } from '../../components/ui/Fab';
import { SettingsIcon } from '../../components/ui/icons';
import { AddExpenseSheet } from '../expenses/AddExpenseSheet';
import { ExpenseList } from '../expenses/ExpenseList';
import { GroupSettingsSheet } from './GroupSettingsSheet';

type Tab = 'expenses' | 'balances';

export function GroupDetailPage() {
  const id = Number(useParams().groupId);
  const group = useGroup(id);
  const [tab, setTab] = useState<Tab>('expenses');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const expenses = useGroupExpenses(id);
  const { data: me } = useMe();

  if (group.isPending) return <PageSpinner />;
  if (group.isError) {
    return (
      <>
        <BackLink to="/groups">Groups</BackLink>
        <Alert tone="error">{group.error.message}</Alert>
      </>
    );
  }
  const { name, members } = group.data;
  const names = members.map((m) => m.name);
  const summary =
    names.length <= 3 ? names.join(', ') : `${names.slice(0, 3).join(', ')} +${names.length - 3}`;

  return (
    <>
      <BackLink to="/groups">Groups</BackLink>
      <header className="mb-6 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-5xl/tight font-bold tracking-[-0.01em] break-words">{name}</h1>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="mt-1 min-h-11 max-w-full truncate text-left text-lg text-chalk-muted"
          >
            {members.length} {members.length === 1 ? 'member' : 'members'} · {summary}
          </button>
        </div>
        <IconButton label="Group settings" onClick={() => setSettingsOpen(true)}>
          <SettingsIcon />
        </IconButton>
      </header>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'expenses', label: 'Expenses' },
          { value: 'balances', label: 'Balances' },
        ]}
      >
        {tab === 'expenses' ? (
          <ExpenseList
            query={expenses}
            meId={me?.id ?? 0}
            emptyText="Tap “Add expense” to record the first one."
          />
        ) : (
          <EmptyState title="All settled">Balances arrive in M4.</EmptyState>
        )}
      </Tabs>

      <GroupSettingsSheet
        group={group.data}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
      <Fab onClick={() => setAdding(true)}>Add expense</Fab>
      <AddExpenseSheet open={adding} onClose={() => setAdding(false)} context={{ groupId: id }} />
    </>
  );
}
