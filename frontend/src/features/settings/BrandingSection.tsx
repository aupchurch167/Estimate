import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { AxiosError } from 'axios';
import { Field, inputClass } from '@/features/auth/Field';
import { backendErrorMessage } from '@/features/auth/useAuth';
import { SectionShell } from './SectionShell';
import { usePatchSettings, useSignLogoUpload } from './useOrganization';
import type { OrgSettings } from '@/features/auth/types';

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
const MAX_BYTES = 5 * 1024 * 1024;

const schema = z.object({
  primaryColorHex: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Use #RRGGBB'),
});
type FormValues = z.infer<typeof schema>;

export function BrandingSection({ settings }: { settings: OrgSettings }) {
  const patch = usePatchSettings();
  const sign = useSignLogoUpload();
  const fileRef = useRef<HTMLInputElement>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [logoMessage, setLogoMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(
    null,
  );
  const [uploading, setUploading] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { primaryColorHex: settings.primaryColorHex },
  });

  const swatch = watch('primaryColorHex');

  useEffect(() => {
    if (!savedAt) return;
    const t = window.setTimeout(() => setSavedAt(null), 2500);
    return () => window.clearTimeout(t);
  }, [savedAt]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      await patch.mutateAsync({ primaryColorHex: values.primaryColorHex });
      reset(values);
      setSavedAt(Date.now());
    } catch {
      // surfaced via patch.error
    }
  });

  const onLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoMessage(null);

    if (!ALLOWED.includes(file.type)) {
      setLogoMessage({ tone: 'error', text: 'Use JPG, PNG, WebP, or SVG.' });
      return;
    }
    if (file.size > MAX_BYTES) {
      setLogoMessage({ tone: 'error', text: 'Logo must be 5 MB or smaller.' });
      return;
    }

    setUploading(true);
    try {
      const signed = await sign.mutateAsync({
        contentType: file.type,
        fileSizeBytes: file.size,
      });
      const put = await fetch(signed.url, {
        method: 'PUT',
        headers: { 'Content-Type': file.type, 'x-amz-acl': 'public-read' },
        body: file,
      });
      if (!put.ok) throw new Error(`Upload failed (${put.status})`);
      await patch.mutateAsync({ logoUrl: signed.publicUrl });
      setLogoMessage({ tone: 'ok', text: 'Logo updated.' });
    } catch (err) {
      const ax = err as AxiosError;
      setLogoMessage({
        tone: 'error',
        text: backendErrorMessage(ax, "Couldn't upload logo. Try again."),
      });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const banner = patch.error ? backendErrorMessage(patch.error, 'Could not save branding.') : null;
  const busy = isSubmitting || patch.isPending;

  return (
    <SectionShell index="B" label="branding" saved={Boolean(savedAt)}>
      <div className="mb-6 flex items-center gap-6">
        <div className="flex h-16 w-16 items-center justify-center border border-rule bg-paper">
          {settings.logoUrl ? (
            <img
              src={settings.logoUrl}
              alt="Org logo"
              className="h-16 w-16 object-contain"
            />
          ) : (
            <span className="font-mono text-[10px] uppercase tracking-label text-dim">No logo</span>
          )}
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-label text-dim">Logo</p>
          <input
            ref={fileRef}
            type="file"
            accept={ALLOWED.join(',')}
            onChange={onLogoChange}
            disabled={uploading}
            className="mt-2 font-mono text-[11px] text-ink file:mr-3 file:border file:border-ink file:bg-paper file:px-3 file:py-1 file:font-mono file:text-[10px] file:uppercase file:tracking-label file:text-ink hover:file:bg-ink hover:file:text-ink-inverse"
          />
          {uploading ? (
            <p className="mt-2 font-mono text-[10px] uppercase tracking-label text-dim">
              Uploading…
            </p>
          ) : null}
          {logoMessage ? (
            <p
              role={logoMessage.tone === 'error' ? 'alert' : undefined}
              className={`mt-2 font-mono text-[10px] uppercase tracking-label ${
                logoMessage.tone === 'error' ? 'text-mark-red' : 'text-mark-green'
              }`}
            >
              {logoMessage.text}
            </p>
          ) : null}
        </div>
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

        <Field label="Primary color" htmlFor="primaryColorHex" error={errors.primaryColorHex?.message}>
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="inline-block h-7 w-7 border border-rule"
              style={{ backgroundColor: swatch }}
            />
            <input
              id="primaryColorHex"
              className={`${inputClass} uppercase`}
              placeholder="#1A1A1A"
              {...register('primaryColorHex')}
            />
          </div>
        </Field>

        <button
          type="submit"
          disabled={!isDirty || busy}
          className="self-start border border-ink bg-ink px-4 py-2 font-mono text-[11px] uppercase tracking-label text-ink-inverse transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save branding'}
        </button>
      </form>
    </SectionShell>
  );
}
