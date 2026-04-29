import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import type { AxiosError } from 'axios';
import { backendErrorCode, backendErrorMessage, useLogin } from './useAuth';
import { Button, Input } from '@/components/ui';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});
type FormValues = z.infer<typeof schema>;

function mapLoginError(err: AxiosError): string {
  const status = err.response?.status;
  const code = backendErrorCode(err);
  if (status === 429 || code === 'rate_limited') {
    return 'Too many attempts. Please wait a minute and try again.';
  }
  if (status === 401 || code === 'invalid_credentials') {
    return 'Invalid email or password.';
  }
  if (!err.response) {
    return "Couldn't reach the server. Check your connection and try again.";
  }
  return backendErrorMessage(err, 'Something went wrong. Please try again.');
}

export function LoginForm() {
  const navigate = useNavigate();
  const login = useLogin();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await login.mutateAsync(values);
      navigate('/app', { replace: true });
    } catch {
      // surfaced via login.error below
    }
  });

  const banner = login.error ? mapLoginError(login.error) : null;
  const busy = isSubmitting || login.isPending;

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
        label="Email"
        type="email"
        autoComplete="email"
        autoFocus
        error={errors.email?.message}
        required
        {...register('email')}
      />

      <Input
        label="Password"
        type="password"
        autoComplete="current-password"
        error={errors.password?.message}
        required
        {...register('password')}
      />

      <Button type="submit" loading={busy} fullWidth size="lg">
        Sign in
      </Button>
    </form>
  );
}
