import { useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router';
import { CreateGroupRequestSchema } from '@split-wise/shared';
import { ApiRequestError } from '../../api/client';
import { applyServerErrors } from '../../api/formErrors';
import { useFriends } from '../../api/friends';
import { useCreateGroup } from '../../api/groups';
import { Alert } from '../../components/ui/Alert';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Checkbox } from '../../components/ui/Checkbox';
import { Sheet } from '../../components/ui/Sheet';
import { TextField } from '../../components/ui/TextField';
import { PlusIcon } from '../../components/ui/icons';
import { contactOf } from '../people/PersonForm';

/** The form holds name + new people; picked friends live in local state. */
const FormSchema = CreateGroupRequestSchema.pick({ name: true, new_members: true });
const emptyPerson = { name: '', email: '', phone: '' };

function CreateGroupForm({
  createGroup,
  onClose,
}: {
  createGroup: ReturnType<typeof useCreateGroup>;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const friends = useFriends();
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(FormSchema),
    defaultValues: { name: '', new_members: [] },
  });
  const newMembers = useFieldArray({ control, name: 'new_members' });

  const toggle = (id: number, on: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const { group } = await createGroup.mutateAsync({ ...values, member_ids: [...picked] });
      onClose();
      navigate(`/groups/${group.id}`);
    } catch (err) {
      const memberError =
        err instanceof ApiRequestError ? err.fieldErrors.member_ids?.[0] : undefined;
      setFormError(memberError ?? applyServerErrors(err, setError, ['name']));
    }
  });

  return (
    <form id="create-group" onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      {formError && <Alert tone="error">{formError}</Alert>}
      <TextField
        label="Group name"
        placeholder="Goa trip, Flat 4B…"
        autoComplete="off"
        error={errors.name?.message}
        {...register('name')}
      />

      <fieldset>
        <legend className="mb-1 text-lg font-semibold">Friends</legend>
        {friends.data?.length ? (
          friends.data.map((f) => (
            <Checkbox key={f.id} checked={picked.has(f.id)} onChange={(on) => toggle(f.id, on)}>
              <Avatar name={f.name} placeholder={f.is_placeholder} />
              <span className="min-w-0">
                <span className="block truncate">{f.name}</span>
                <span className="block truncate text-lg text-chalk-muted">{contactOf(f)}</span>
              </span>
            </Checkbox>
          ))
        ) : (
          <p className="text-lg text-chalk-muted">
            {friends.isPending ? 'Loading friends…' : 'No friends yet — add people below.'}
          </p>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1 text-lg font-semibold">Someone new</legend>
        {newMembers.fields.map((field, i) => {
          const e = errors.new_members?.[i];
          return (
            <div key={field.id} className="flex flex-col gap-3 rounded-card border border-line p-4">
              <TextField
                label="Name"
                autoComplete="off"
                error={e?.name?.message}
                {...register(`new_members.${i}.name`)}
              />
              <TextField
                label="Email"
                type="email"
                inputMode="email"
                autoCapitalize="none"
                spellCheck={false}
                autoComplete="off"
                error={e?.email?.message}
                {...register(`new_members.${i}.email`)}
              />
              <TextField
                label="Phone"
                type="tel"
                inputMode="tel"
                autoComplete="off"
                placeholder="+919876543210"
                error={e?.phone?.message}
                {...register(`new_members.${i}.phone`)}
              />
              <Button variant="secondary" onClick={() => newMembers.remove(i)}>
                Remove
              </Button>
            </div>
          );
        })}
        <Button variant="secondary" onClick={() => newMembers.append(emptyPerson)}>
          <PlusIcon />
          Add someone new
        </Button>
      </fieldset>
    </form>
  );
}

export function CreateGroupSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const createGroup = useCreateGroup();
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="New group"
      variant="full"
      footer={
        <Button type="submit" form="create-group" loading={createGroup.isPending} fullWidth>
          Create group
        </Button>
      }
    >
      {open && <CreateGroupForm createGroup={createGroup} onClose={onClose} />}
    </Sheet>
  );
}
