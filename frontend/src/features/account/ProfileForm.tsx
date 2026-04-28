import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { AxiosError } from 'axios';
import { useAuthContext } from '@/context/useAuthContext';
import { Field, inputClass } from '@/features/auth/Field';
import { backendErrorMessage } from '@/features/auth/useAuth';
import { useSignAvatarUpload, useUpdateProfile } from './useAccount';
import type { SafeUser } from '@/features/auth/types';

const schema = z.object({
  firstName: z.string().min(1, 'First name is required').max(80),
  lastName: z.string().min(1, 'Last name is required').max(80),
});
type FormValues = z.infer<typeof schema>;

const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;

export function ProfileForm() {
  const { user } = useAuthContext();
  if (!user) return null;
  return <ProfileFormInner user={user} />;
}

function ProfileFormInner({ user }: { user: SafeUser }) {
  const update = useUpdateProfile(user.id);
  const signAvatar = useSignAvatarUpload(user.id);
  const [avatarMessage, setAvatarMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(
    null,
  );
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty, isSubmitting, isSubmitSuccessful },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { firstName: user?.firstName ?? '', lastName: user?.lastName ?? '' },
  });

  useEffect(() => {
    if (isSubmitSuccessful && user) {
      reset({ firstName: user.firstName, lastName: user.lastName });
    }
  }, [isSubmitSuccessful, user, reset]);

  const onSubmit = handleSubmit(async (values) => {
    await update.mutateAsync(values).catch(() => {
      // surfaced via update.error below
    });
  });

  const onAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setAvatarMessage(null);

    if (!ALLOWED_MIMES.includes(file.type)) {
      setAvatarMessage({ tone: 'error', text: 'Only JPEG, PNG, or WebP files are accepted.' });
      return;
    }
    if (file.size > MAX_BYTES) {
      setAvatarMessage({ tone: 'error', text: 'Avatar must be 5 MB or smaller.' });
      return;
    }

    setUploading(true);
    try {
      const signed = await signAvatar.mutateAsync({
        contentType: file.type,
        fileSizeBytes: file.size,
      });
      const putRes = await fetch(signed.url, {
        method: 'PUT',
        headers: { 'Content-Type': file.type, 'x-amz-acl': 'public-read' },
        body: file,
      });
      if (!putRes.ok) {
        throw new Error(`Upload failed (${putRes.status})`);
      }
      await update.mutateAsync({ avatarUrl: signed.publicUrl });
      setAvatarMessage({ tone: 'ok', text: 'Avatar updated.' });
    } catch (err) {
      const ax = err as AxiosError;
      const msg = backendErrorMessage(ax, "Couldn't upload avatar. Try again.");
      setAvatarMessage({ tone: 'error', text: msg });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const banner = update.error
    ? backendErrorMessage(update.error, 'Could not save profile.')
    : null;
  const initials = `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase();

  return (
    <section className="border border-rule bg-paper-elevated p-6">
      <div className="mb-6 flex items-baseline justify-between border-b border-rule-soft pb-3">
        <p className="font-mono text-[10px] uppercase tracking-label text-dim">A · profile</p>
        <p className="font-mono text-[10px] uppercase tracking-label text-dim">{user.role}</p>
      </div>

      <div className="mb-6 flex items-center gap-6">
        <div className="flex h-16 w-16 items-center justify-center border border-rule bg-paper">
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={`${user.firstName} ${user.lastName}`}
              className="h-16 w-16 object-cover"
            />
          ) : (
            <span className="font-mono text-[14px] uppercase tracking-title text-dim">
              {initials || '—'}
            </span>
          )}
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-label text-dim">Avatar</p>
          <input
            ref={fileRef}
            id="avatar"
            type="file"
            accept={ALLOWED_MIMES.join(',')}
            onChange={onAvatarChange}
            disabled={uploading}
            className="mt-2 font-mono text-[11px] text-ink file:mr-3 file:border file:border-ink file:bg-paper file:px-3 file:py-1 file:font-mono file:text-[10px] file:uppercase file:tracking-label file:text-ink hover:file:bg-ink hover:file:text-ink-inverse"
          />
          {uploading ? (
            <p className="mt-2 font-mono text-[10px] uppercase tracking-label text-dim">
              Uploading…
            </p>
          ) : null}
          {avatarMessage ? (
            <p
              role={avatarMessage.tone === 'error' ? 'alert' : undefined}
              className={`mt-2 font-mono text-[10px] uppercase tracking-label ${
                avatarMessage.tone === 'error' ? 'text-mark-red' : 'text-mark-green'
              }`}
            >
              {avatarMessage.text}
            </p>
          ) : null}
        </div>
      </div>

      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-6">
        {banner ? (
          <div
            role="alert"
            className="border border-mark-red/60 px-4 py-3 font-mono text-[11px] uppercase tracking-label text-mark-red"
          >
            {banner}
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-4">
          <Field label="First name" htmlFor="firstName" error={errors.firstName?.message}>
            <input
              id="firstName"
              type="text"
              autoComplete="given-name"
              className={inputClass}
              {...register('firstName')}
            />
          </Field>
          <Field label="Last name" htmlFor="lastName" error={errors.lastName?.message}>
            <input
              id="lastName"
              type="text"
              autoComplete="family-name"
              className={inputClass}
              {...register('lastName')}
            />
          </Field>
        </div>

        <Field label="Email" htmlFor="email">
          <input
            id="email"
            type="email"
            value={user.email}
            disabled
            className={`${inputClass} cursor-not-allowed text-dim`}
          />
        </Field>

        <button
          type="submit"
          disabled={!isDirty || isSubmitting || update.isPending}
          className="self-start border border-ink bg-ink px-4 py-2 font-mono text-[11px] uppercase tracking-label text-ink-inverse transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {update.isPending || isSubmitting ? 'Saving…' : 'Save profile'}
        </button>
      </form>
    </section>
  );
}
