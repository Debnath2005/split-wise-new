import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useLocation, useNavigate } from 'react-router';
import { LoginRequestSchema } from '@split-wise/shared';
import { useLogin } from '../../api/auth';
import { applyServerErrors } from '../../api/formErrors';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/TextField';
import type { FromState } from '../../app/guards';
import { AuthLayout } from './AuthLayout';

export function LoginPage() {
  const navigate = useNavigate();
  const from = (useLocation().state as FromState | null)?.from ?? '/friends';
  const login = useLogin();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm({ resolver: zodResolver(LoginRequestSchema) });

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    login.mutate(values, {
      onSuccess: () => navigate(from, { replace: true }),
      onError: (err) => setFormError(applyServerErrors(err, setError, ['email', 'password'])),
    });
  });

  return (
    <AuthLayout title="Log in">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {formError && <Alert tone="error">{formError}</Alert>}
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          inputMode="email"
          error={errors.email?.message}
          {...register('email')}
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          revealable
          error={errors.password?.message}
          {...register('password')}
        />
        <Button type="submit" loading={login.isPending} fullWidth>
          Log in
        </Button>
      </form>
      <p className="mt-6 text-center text-base text-chalk-muted">
        New here?{' '}
        <Link to="/signup" state={{ from }} className="font-semibold text-accent">
          Create an account
        </Link>
      </p>
    </AuthLayout>
  );
}
