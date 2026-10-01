import { useState } from 'react';
import { useParams } from 'react-router';
import { useGroup } from '../../api/groups';
import { Alert } from '../../components/ui/Alert';
import { BackLink } from '../../components/ui/BackLink';
import { EmptyState } from '../../components/ui/EmptyState';
import { IconButton } from '../../components/ui/IconButton';
import { PageSpinner } from '../../components/ui/Spinner';
import { Tabs } from '../../components/ui/Tabs';
import { SettingsIcon } from '../../components/ui/icons';
import { GroupSettingsSheet } from './GroupSettingsSheet';

type Tab = 'expenses' | 'balances';

export function GroupDetailPage() {
  const id = Number(useParams().groupId);
  const group = useGroup(id);
  const [tab, setTab] = useState<Tab>('expenses');
  const [settingsOpen, setSettingsOpen] = useState(false);

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
          <h1 className="text-[32px]/tight font-bold tracking-[-0.01em] break-words">{name}</h1>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="mt-1 min-h-11 max-w-full truncate text-left text-sm text-gray-dark-2"
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
          <EmptyState title="No expenses yet">Adding expenses arrives in M3.</EmptyState>
        ) : (
          <EmptyState title="All settled">Balances arrive in M4.</EmptyState>
        )}
      </Tabs>

      <GroupSettingsSheet
        group={group.data}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </>
  );
}
