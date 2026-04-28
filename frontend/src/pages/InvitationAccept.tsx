import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useParams } from 'react-router-dom';
import type { AxiosError } from 'axios';
import { useQueryClient } from '@tanstack/react-query';
import { Field, inputClass } from '@/features/auth/Field';
import { ME_QUERY_KEY, backendErrorCode, backendErrorMessage } from '@/features/auth/useAuth';
import { useAcceptInvitation, usePublicInvitation } from '@/features/team/useTeam';

const schema = z.object({
  password: z.string().min(8, 'At least 8 characters').max(128),
  firstName: z.string().min(1, 'First name is required').max(80),
  lastName: z.string().min(1, 'Last name is required').max(80),
});
type FormValues = z.infer<typeof schema>;

function mapAcceptError(err: AxiosError): string {
  const status = err.response?.status;
  const code = backendErrorCode(err);
  if (status === 410) {
    if (code === 'invitation_expired') return 'This invitation has expired.';
    if (code === 'invitation_revoked') return 'This invitation has been revoked.';
    if (code === 'invitation_accepted') return 'This invitation has already been used.';
    return 'This invitation is no longer valid.';
  }
  if (status === 404) return 'This invitation could not be found.';
  if (status === 400) return backendErrorMessage(err, 'Check your inputs and try again.');
  return backendErrorMessage(err, 'Could not accept invitation.');
}

export function InvitationAcceptPage() {
  const { token = '' } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const lookup = usePublicInvitation(token);
  const accept = useAcceptInvitation(token);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { password: '', firstName: '', lastName: '' },
  });

  useEffect(() => {
    if (accept.isSuccess) {
      qc.invalidateQueries({ queryKey: ME_QUERY_KEY });
      navigate('/app', { replace: true });
    }
  }, [accept.isSuccess, qc, navigate]);

  if (!token) {
    return <ErrorState title="Invitation link is missing a token." />;
  }

  if (lookup.isLoading) {
    return (
      <Shell>
        <p className="font-mono text-[10px] uppercase tracking-label text-dim">Loading…</p>
      </Shell>
    );
  }

  if (lookup.isError) {
    const reason = mapAcceptError(lookup.error as AxiosError);
    return <ErrorState title={reason} />;
  }
  if (!lookup.data) {
    return <ErrorState title="This invitation is no longer valid." />;
  }

  const inv = lookup.data;
  const banner = accept.error ? mapAcceptError(accept.error) : null;
  const busy = isSubmitting || accept.isPending;

  const onSubmit = handleSubmit(async (values) => {
    try {
      await accept.mutateAsync({
        email: inv.email,
        password: values.password,
        firstName: values.firstName,
        lastName: values.lastName,
      });
    } catch {
      // surfaced via accept.error banner
    }
  });

  return (
    <Shell>
      <header className="mb-6 border-b border-rule pb-4 text-center">
        <h1 className="font-mono text-[14px] uppercase tracking-title text-ink">Quill</h1>
        <p className="mt-2 font-mono text-[10px] uppercase tracking-label text-dim">
          You're invited
        </p>
      </header>
      <p className="mb-6 font-sans text-[13px] text-ink">
        <strong>{inv.inviterName}</strong> invited you to join{' '}
        <strong>{inv.organizationName}</strong> as a <strong>{inv.role}</strong>.
      </p>

      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-5">
        {banner ? (
          <div
            role="alert"
            className="border border-mark-red/60 px-3 py-2 font-mono text-[10px] uppercase tracking-label text-mark-red"
          >
            {banner}
          </div>
        ) : null}

        <Field label="Email" htmlFor="email">
          <input
            id="email"
            type="email"
            value={inv.email}
            disabled
            className={`${inputClass} cursor-not-allowed text-dim`}
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="First name" htmlFor="firstName" error={errors.firstName?.message}>
            <input
              id="firstName"
              autoComplete="given-name"
              autoFocus
              className={inputClass}
              {...register('firstName')}
            />
          </Field>
          <Field label="Last name" htmlFor="lastName" error={errors.lastName?.message}>
            <input
              id="lastName"
              autoComplete="family-name"
              className={inputClass}
              {...register('lastName')}
            />
          </Field>
        </div>

        <Field label="Set a password" htmlFor="password" error={errors.password?.message}>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            className={inputClass}
            {...register('password')}
          />
        </Field>

        <button
          type="submit"
          disabled={busy}
          className="mt-2 border border-ink bg-ink py-3 font-mono text-[11px] uppercase tracking-label text-ink-inverse transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Joining…' : `Join ${inv.organizationName}`}
        </button>

        <p className="font-mono text-[10px] uppercase tracking-label text-dim">
          Expires {new Date(inv.expiresAt).toLocaleString()}
        </p>
      </form>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper p-6">
      <div className="w-full max-w-[440px] border border-ink bg-paper-elevated p-8">{children}</div>
    </div>
  );
}

function ErrorState({ title }: { title: string }) {
  return (
    <Shell>
      <header className="mb-6 border-b border-rule pb-4 text-center">
        <h1 className="font-mono text-[14px] uppercase tracking-title text-ink">Quill</h1>
        <p className="mt-2 font-mono text-[10px] uppercase tracking-label text-mark-red">
          Invitation error
        </p>
      </header>
      <p role="alert" className="font-sans text-[14px] text-ink">
        {title}
      </p>
      <p className="mt-3 max-w-[40ch] font-sans text-[12px] text-dim">
        Contact the person who invited you, or have an admin send a fresh invitation.
      </p>
    </Shell>
  );
}
