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
import { Avatar, Badge, Button, Card } from '@/components/ui';

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

  return (
    <Card title="Profile" actions={<Badge variant="info">{user.role}</Badge>}>
      <div className="flex items-center gap-6">
        <Avatar
          name={`${user.firstName} ${user.lastName}`}
          src={user.avatarUrl}
          size="lg"
        />
        <div className="flex flex-col gap-1.5">
          <p className="text-[13px] font-medium text-text-primary">Avatar</p>
          <input
            ref={fileRef}
            id="avatar"
            type="file"
            accept={ALLOWED_MIMES.join(',')}
            onChange={onAvatarChange}
            disabled={uploading}
            className="text-[13px] text-text-secondary file:mr-3 file:cursor-pointer file:rounded-md file:border file:border-border-primary file:bg-bg-primary file:px-3 file:py-1.5 file:text-[13px] file:font-medium file:text-text-primary hover:file:bg-bg-tertiary disabled:cursor-not-allowed disabled:opacity-60"
          />
          {uploading ? (
            <p className="text-[12px] text-text-secondary">Uploading…</p>
          ) : null}
          {avatarMessage ? (
            <p
              role={avatarMessage.tone === 'error' ? 'alert' : undefined}
              className={`text-[12px] ${
                avatarMessage.tone === 'error' ? 'text-danger' : 'text-success'
              }`}
            >
              {avatarMessage.text}
            </p>
          ) : null}
        </div>
      </div>

      <form noValidate onSubmit={onSubmit} className="mt-6 flex flex-col gap-5">
        {banner ? (
          <div
            role="alert"
            className="rounded-md border border-danger/40 bg-danger-light px-3 py-2 text-[13px] text-danger"
          >
            {banner}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
          <input id="email" type="email" value={user.email} disabled className={inputClass} />
        </Field>

        <Button
          type="submit"
          loading={update.isPending || isSubmitting}
          disabled={!isDirty}
          className="self-start"
        >
          Save profile
        </Button>
      </form>
    </Card>
  );
}
