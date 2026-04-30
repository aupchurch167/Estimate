import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { AxiosError } from 'axios';
import { useAuthContext } from '@/context/useAuthContext';
import { Field, inputClass } from '@/features/auth/Field';
import { backendErrorCode, backendErrorMessage } from '@/features/auth/useAuth';
import { useChangePassword } from './useAccount';
import type { SafeUser } from '@/features/auth/types';
import { Button, Card } from '@/components/ui';

const schema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(8, 'New password must be at least 8 characters').max(128),
    confirmPassword: z.string().min(1, 'Confirm your new password'),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'New passwords do not match',
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    path: ['newPassword'],
    message: 'New password must differ from current password',
  });

type FormValues = z.infer<typeof schema>;

function mapPasswordError(err: AxiosError): string {
  const status = err.response?.status;
  const code = backendErrorCode(err);
  if (status === 401 || code === 'invalid_current_password') {
    return 'Current password is incorrect.';
  }
  if (!err.response) {
    return "Couldn't reach the server. Try again.";
  }
  return backendErrorMessage(err, 'Could not update password.');
}

export function PasswordForm() {
  const { user } = useAuthContext();
  if (!user) return null;
  return <PasswordFormInner user={user} />;
}

function PasswordFormInner({ user }: { user: SafeUser }) {
  const change = useChangePassword(user.id);
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setSuccess(false);
    try {
      await change.mutateAsync({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      reset({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setSuccess(true);
    } catch {
      // surfaced via change.error below
    }
  });

  const banner = change.error ? mapPasswordError(change.error) : null;

  return (
    <Card title="Security">
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-5">
        {success ? (
          <div className="rounded-md border border-success/40 bg-success-light px-3 py-2 text-[13px] text-success">
            Password updated.
          </div>
        ) : null}
        {banner ? (
          <div
            role="alert"
            className="rounded-md border border-danger/40 bg-danger-light px-3 py-2 text-[13px] text-danger"
          >
            {banner}
          </div>
        ) : null}

        <Field
          label="Current password"
          htmlFor="currentPassword"
          error={errors.currentPassword?.message}
        >
          <input
            id="currentPassword"
            type="password"
            autoComplete="current-password"
            className={inputClass}
            {...register('currentPassword')}
          />
        </Field>

        <Field label="New password" htmlFor="newPassword" error={errors.newPassword?.message}>
          <input
            id="newPassword"
            type="password"
            autoComplete="new-password"
            className={inputClass}
            {...register('newPassword')}
          />
        </Field>

        <Field
          label="Confirm new password"
          htmlFor="confirmPassword"
          error={errors.confirmPassword?.message}
        >
          <input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            className={inputClass}
            {...register('confirmPassword')}
          />
        </Field>

        <Button
          type="submit"
          loading={isSubmitting || change.isPending}
          className="self-start"
        >
          Update password
        </Button>
      </form>
    </Card>
  );
}
