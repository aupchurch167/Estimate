import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { AxiosError } from 'axios';
import { Field, inputClass } from '@/features/auth/Field';
import { backendErrorCode, backendErrorMessage } from '@/features/auth/useAuth';
import { useInvite } from './useTeam';

const schema = z.object({
  email: z.string().email('Enter a valid email').max(254),
  role: z.enum(['ADMIN', 'ESTIMATOR', 'PM', 'VIEWER']),
});
type FormValues = z.infer<typeof schema>;

interface InviteModalProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (acceptUrl: string, emailDispatched: boolean) => void;
}

function mapInviteError(err: AxiosError): string {
  const status = err.response?.status;
  const code = backendErrorCode(err);
  if (code === 'invitation_pending') return 'A pending invitation already exists for this email.';
  if (code === 'user_already_exists') return 'A user with this email already exists.';
  if (status === 400 || code === 'validation_error') {
    return backendErrorMessage(err, 'Check the email and role and try again.');
  }
  if (!err.response) return "Couldn't reach the server. Try again.";
  return backendErrorMessage(err, 'Could not send invitation.');
}

export function InviteModal({ open, onClose, onCreated }: InviteModalProps) {
  const invite = useInvite();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', role: 'ESTIMATOR' },
  });

  // Reset form + mutation when the modal closes. Including the mutation
  // object in deps would loop because useMutation returns a new object
  // every render — we only want to react to `open`.
  useEffect(() => {
    if (open) return;
    reset({ email: '', role: 'ESTIMATOR' });
    invite.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const onSubmit = handleSubmit(async (values) => {
    try {
      const result = await invite.mutateAsync(values);
      onCreated?.(result.acceptUrl, result.emailDispatched);
      onClose();
    } catch {
      // surfaced via invite.error banner
    }
  });

  const banner = invite.error ? mapInviteError(invite.error) : null;
  const busy = isSubmitting || invite.isPending;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="invite-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[440px] border border-ink bg-paper-elevated p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-baseline justify-between border-b border-rule pb-3">
          <h2
            id="invite-title"
            className="font-mono text-[12px] uppercase tracking-title text-ink"
          >
            Invite teammate
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="font-mono text-[10px] uppercase tracking-label text-dim hover:text-ink"
          >
            Close
          </button>
        </div>

        <form noValidate onSubmit={onSubmit} className="flex flex-col gap-5">
          {banner ? (
            <div
              role="alert"
              className="border border-mark-red/60 px-3 py-2 font-mono text-[10px] uppercase tracking-label text-mark-red"
            >
              {banner}
            </div>
          ) : null}

          <Field label="Email" htmlFor="invite-email" error={errors.email?.message}>
            <input
              id="invite-email"
              type="email"
              autoFocus
              autoComplete="email"
              className={inputClass}
              {...register('email')}
            />
          </Field>

          <Field label="Role" htmlFor="invite-role" error={errors.role?.message}>
            <select
              id="invite-role"
              className={`${inputClass} bg-paper`}
              {...register('role')}
            >
              <option value="ADMIN">Admin</option>
              <option value="ESTIMATOR">Estimator</option>
              <option value="PM">PM</option>
              <option value="VIEWER">Viewer</option>
            </select>
          </Field>

          <p className="font-mono text-[10px] uppercase tracking-label text-dim">
            OWNER cannot be invited — owners are created by signing up a new org.
          </p>

          <div className="mt-2 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="border border-rule px-3 py-1 font-mono text-[10px] uppercase tracking-label text-ink hover:border-ink"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="border border-ink bg-ink px-4 py-2 font-mono text-[11px] uppercase tracking-label text-ink-inverse transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? 'Sending…' : 'Send invitation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
