import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { PersonInputSchema, type Person, type PersonInput } from '@split-wise/shared';
import { applyServerErrors } from '../../api/formErrors';
import { Alert } from '../../components/ui/Alert';
import { TextField } from '../../components/ui/TextField';

interface PersonFormProps {
  /** Lets a submit button outside the form (e.g. in a sheet footer) submit it via `form=`. */
  formId: string;
  submit: (values: PersonInput) => Promise<unknown>;
  onDone: () => void;
}

/** Name + email or phone. An existing user with that email/phone is matched on the server. */
export function PersonForm({ formId, submit, onDone }: PersonFormProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(PersonInputSchema),
    defaultValues: { name: '', email: '', phone: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await submit(values);
      reset();
      onDone();
    } catch (err) {
      setFormError(applyServerErrors(err, setError, ['name', 'email', 'phone']));
    }
  });

  return (
    <form id={formId} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {formError && <Alert tone="error">{formError}</Alert>}
      <TextField
        label="Name"
        autoComplete="off"
        error={errors.name?.message}
        {...register('name')}
      />
      <TextField
        label="Email"
        type="email"
        inputMode="email"
        autoCapitalize="none"
        spellCheck={false}
        autoComplete="off"
        error={errors.email?.message}
        {...register('email')}
      />
      <TextField
        label="Phone"
        type="tel"
        inputMode="tel"
        autoComplete="off"
        placeholder="+919876543210"
        hint="Email or phone is required. If they already use Split-wise, we'll find them."
        error={errors.phone?.message}
        {...register('phone')}
      />
    </form>
  );
}

/** One line identifying a person: their email, else their phone. */
export function contactOf(person: Pick<Person, 'email' | 'phone'>): string {
  return person.email ?? person.phone ?? '';
}
