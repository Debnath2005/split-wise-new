import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { UpdateGroupRequestSchema, type GroupDetail } from '@split-wise/shared';
import { useMe } from '../../api/auth';
import { applyServerErrors } from '../../api/formErrors';
import { useFriends } from '../../api/friends';
import { useAddGroupMember, useRenameGroup } from '../../api/groups';
import { Alert } from '../../components/ui/Alert';
import { Avatar } from '../../components/ui/Avatar';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { List, ListRow } from '../../components/ui/ListRow';
import { Sheet } from '../../components/ui/Sheet';
import { TextField } from '../../components/ui/TextField';
import { PlusIcon } from '../../components/ui/icons';
import { PersonForm, contactOf } from '../people/PersonForm';

function RenameForm({ group }: { group: GroupDetail }) {
  const rename = useRenameGroup(group.id);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isDirty },
  } = useForm({
    resolver: zodResolver(UpdateGroupRequestSchema),
    defaultValues: { name: group.name },
  });

  const onSubmit = handleSubmit(async ({ name }) => {
    setNotice(null);
    try {
      const { group: saved } = await rename.mutateAsync(name);
      reset({ name: saved.name });
      setNotice({ tone: 'success', text: 'Saved' });
    } catch (err) {
      const message = applyServerErrors(err, setError, ['name']);
      if (message) setNotice({ tone: 'error', text: message });
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
      <TextField
        label="Group name"
        autoComplete="off"
        error={errors.name?.message}
        {...register('name')}
      />
      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
      <Button type="submit" variant="secondary" loading={rename.isPending} disabled={!isDirty}>
        Save name
      </Button>
    </form>
  );
}

function AddMemberView({ group, onDone }: { group: GroupDetail; onDone: () => void }) {
  const friends = useFriends();
  const addMember = useAddGroupMember(group.id);
  const [error, setError] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<number | null>(null);
  const memberIds = new Set(group.members.map((m) => m.id));
  const candidates = (friends.data ?? []).filter((f) => !memberIds.has(f.id));

  const addFriend = async (userId: number) => {
    setError(null);
    setAddingId(userId);
    try {
      await addMember.mutateAsync({ user_id: userId });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setAddingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {error && <Alert tone="error">{error}</Alert>}
      {candidates.length > 0 && (
        <section>
          <h3 className="mb-2 text-lg font-semibold">Your friends</h3>
          <List label="Friends not in this group">
            {candidates.map((f) => (
              <ListRow
                key={f.id}
                leading={<Avatar name={f.name} placeholder={f.is_placeholder} />}
                title={<span className="truncate">{f.name}</span>}
                subtitle={contactOf(f)}
                trailing={
                  <Button
                    variant="secondary"
                    loading={addingId === f.id}
                    disabled={addingId !== null}
                    onClick={() => void addFriend(f.id)}
                    aria-label={`Add ${f.name}`}
                  >
                    Add
                  </Button>
                }
              />
            ))}
          </List>
        </section>
      )}
      <section className="flex flex-col gap-4">
        <h3 className="text-lg font-semibold">Someone new</h3>
        <PersonForm
          formId="add-member"
          submit={(values) => addMember.mutateAsync(values)}
          onDone={onDone}
        />
        <Button type="submit" form="add-member" loading={addMember.isPending && addingId === null}>
          Add to group
        </Button>
      </section>
    </div>
  );
}

export function GroupSettingsSheet({
  group,
  open,
  onClose,
}: {
  group: GroupDetail;
  open: boolean;
  onClose: () => void;
}) {
  const { data: me } = useMe();
  const [view, setView] = useState<'main' | 'add'>('main');
  const close = () => {
    setView('main');
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={close}
      title={view === 'add' ? 'Add member' : 'Group settings'}
      variant="full"
    >
      {open && view === 'add' && <AddMemberView group={group} onDone={() => setView('main')} />}
      {open && view === 'main' && (
        <div className="flex flex-col gap-8">
          <RenameForm group={group} />
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Members ({group.members.length})</h3>
              <Button variant="secondary" onClick={() => setView('add')}>
                <PlusIcon />
                Add member
              </Button>
            </div>
            <List label="Members">
              {group.members.map((m) => (
                <ListRow
                  key={m.id}
                  leading={<Avatar name={m.name} placeholder={m.is_placeholder} />}
                  title={
                    <>
                      <span className="truncate">
                        {m.id === me?.id ? `${m.name} (you)` : m.name}
                      </span>
                      {m.is_placeholder && <Badge>Invited</Badge>}
                    </>
                  }
                  subtitle={contactOf(m)}
                />
              ))}
            </List>
          </section>
        </div>
      )}
    </Sheet>
  );
}
