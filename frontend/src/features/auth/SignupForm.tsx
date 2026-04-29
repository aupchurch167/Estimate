import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import type { AxiosError } from 'axios';
import { backendErrorCode, backendErrorMessage, useSignup } from './useAuth';
import { Button, Input } from '@/components/ui';

const schema = z.object({
  companyName: z.string().min(1, 'Company name is required').max(120),
  firstName: z.string().min(1, 'First name is required').max(80),
  lastName: z.string().min(1, 'Last name is required').max(80),
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
});
type FormValues = z.infer<typeof schema>;

function mapSignupError(err: AxiosError): string {
  const status = err.response?.status;
  const code = backendErrorCode(err);
  if (status === 429 || code === 'rate_limited') {
    return 'Too many attempts. Please wait a minute and try again.';
  }
  if (status === 409 || code === 'email_taken') {
    return 'An account with this email already exists. Try signing in.';
  }
  if (!err.response) {
    return "Couldn't reach the server. Check your connection and try again.";
  }
  return backendErrorMessage(err, 'Something went wrong. Please try again.');
}

export function SignupForm() {
  const navigate = useNavigate();
  const signup = useSignup();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      companyName: '',
      firstName: '',
      lastName: '',
      email: '',
      password: '',
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await signup.mutateAsync(values);
      navigate('/app', { replace: true });
    } catch {
      // surfaced below
    }
  });

  const banner = signup.error ? mapSignupError(signup.error) : null;
  const busy = isSubmitting || signup.isPending;

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
      {banner ? (
        <div
          role="alert"
          className="rounded-md border border-danger/30 bg-danger-light px-3 py-2 text-[13px] text-danger"
        >
          {banner}
        </div>
      ) : null}

      <Input
        label="Company name"
        autoComplete="organization"
        autoFocus
        error={errors.companyName?.message}
        required
        {...register('companyName')}
      />

      <div className="grid grid-cols-2 gap-3">
        <Input
          label="First name"
          autoComplete="given-name"
          error={errors.firstName?.message}
          required
          {...register('firstName')}
        />
        <Input
          label="Last name"
          autoComplete="family-name"
          error={errors.lastName?.message}
          required
          {...register('lastName')}
        />
      </div>

      <Input
        label="Email"
        type="email"
        autoComplete="email"
        error={errors.email?.message}
        required
        {...register('email')}
      />

      <Input
        label="Password"
        type="password"
        autoComplete="new-password"
        helpText="At least 8 characters."
        error={errors.password?.message}
        required
        {...register('password')}
      />

      <Button type="submit" loading={busy} fullWidth size="lg" className="mt-2">
        Create account
      </Button>
    </form>
  );
}
