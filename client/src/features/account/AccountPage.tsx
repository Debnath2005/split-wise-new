import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router';
import { ChangePasswordRequestSchema, UpdateMeRequestSchema, type User } from '@split-wise/shared';
import { useChangePassword, useLogout, useMe, useUpdateMe } from '../../api/auth';
import { applyServerErrors } from '../../api/formErrors';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';
import { TextField } from '../../components/ui/TextField';

/** Every field is present in the form; the request schema itself keeps them optional for PATCH. */
const ProfileFormSchema = UpdateMeRequestSchema.required();

const toProfileValues = (user: User) => ({
  name: user.name,
  phone: user.phone ?? '',
  upi_vpa: user.upi_vpa ?? '',
});

function ProfileForm({ user }: { user: User }) {
  const update = useUpdateMe();
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isDirty },
  } = useForm({
    resolver: zodResolver(ProfileFormSchema),
    defaultValues: toProfileValues(user),
  });

  const onSubmit = handleSubmit((values) => {
    setNotice(null);
    update.mutate(values, {
      onSuccess: ({ user: saved }) => {
        reset(toProfileValues(saved));
        setNotice({ tone: 'success', text: 'Saved' });
      },
      onError: (err) => {
        const message = applyServerErrors(err, setError, ['name', 'phone', 'upi_vpa']);
        if (message) setNotice({ tone: 'error', text: message });
      },
    });
  });

  return (
    <Card title="Profile">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <TextField
          label="Name"
          autoComplete="name"
          error={errors.name?.message}
          {...register('name')}
        />
        <TextField label="Email" value={user.email ?? ''} readOnly hint="Email can't be changed" />
        <TextField
          label="Phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="+919876543210"
          hint="Optional. International format with country code."
          error={errors.phone?.message}
          {...register('phone')}
        />
        <TextField
          label="UPI ID"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="name@okicici"
          hint="Friends use this to pay you back via UPI."
          error={errors.upi_vpa?.message}
          {...register('upi_vpa')}
        />
        {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
        <Button type="submit" loading={update.isPending} disabled={!isDirty} fullWidth>
          Save changes
        </Button>
      </form>
    </Card>
  );
}

function PasswordForm() {
  const change = useChangePassword();
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(ChangePasswordRequestSchema),
    defaultValues: { current: '', next: '' },
  });

  const onSubmit = handleSubmit((values) => {
    setNotice(null);
    change.mutate(values, {
      onSuccess: () => {
        reset();
        setNotice({ tone: 'success', text: 'Password updated' });
      },
      onError: (err) => {
        const message = applyServerErrors(err, setError, ['current', 'next']);
        if (message) setNotice({ tone: 'error', text: message });
      },
    });
  });

  return (
    <Card title="Change password">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <TextField
          label="Current password"
          type="password"
          autoComplete="current-password"
          revealable
          error={errors.current?.message}
          {...register('current')}
        />
        <TextField
          label="New password"
          type="password"
          autoComplete="new-password"
          revealable
          hint="At least 8 characters"
          error={errors.next?.message}
          {...register('next')}
        />
        {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
        <Button type="submit" variant="secondary" loading={change.isPending} fullWidth>
          Update password
        </Button>
      </form>
    </Card>
  );
}

export function AccountPage() {
  const { data: user } = useMe();
  const logout = useLogout();
  const navigate = useNavigate();
  if (!user) return null;

  return (
    <>
      <PageHeader title="Account" />
      <div className="flex flex-col gap-4">
        <ProfileForm user={user} />
        <PasswordForm />
        {logout.isError && <Alert tone="error">{logout.error.message}</Alert>}
        <Button
          variant="secondary"
          fullWidth
          loading={logout.isPending}
          onClick={() =>
            logout.mutate(undefined, { onSuccess: () => navigate('/login', { replace: true }) })
          }
        >
          Log out
        </Button>
      </div>
    </>
  );
}
