import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useLocation, useNavigate } from 'react-router';
import { SignupRequestSchema } from '@split-wise/shared';
import { useSignup } from '../../api/auth';
import { applyServerErrors } from '../../api/formErrors';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/TextField';
import type { FromState } from '../../app/guards';
import { AuthLayout } from './AuthLayout';

export function SignupPage() {
  const navigate = useNavigate();
  const from = (useLocation().state as FromState | null)?.from ?? '/friends';
  const signup = useSignup();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm({ resolver: zodResolver(SignupRequestSchema) });

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    signup.mutate(values, {
      onSuccess: () => navigate(from, { replace: true }),
      onError: (err) =>
        setFormError(applyServerErrors(err, setError, ['name', 'email', 'password'])),
    });
  });

  return (
    <AuthLayout title="Create account">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {formError && <Alert tone="error">{formError}</Alert>}
        <TextField
          label="Name"
          autoComplete="name"
          error={errors.name?.message}
          {...register('name')}
        />
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
          autoComplete="new-password"
          revealable
          hint="At least 8 characters"
          error={errors.password?.message}
          {...register('password')}
        />
        <Button type="submit" loading={signup.isPending} fullWidth>
          Create account
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-gray-dark-2">
        Already have an account?{' '}
        <Link to="/login" state={{ from }} className="font-semibold text-link">
          Log in
        </Link>
      </p>
    </AuthLayout>
  );
}
