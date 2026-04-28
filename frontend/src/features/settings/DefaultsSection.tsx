import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Field, inputClass } from '@/features/auth/Field';
import { backendErrorMessage } from '@/features/auth/useAuth';
import { SectionShell } from './SectionShell';
import { usePatchSettings } from './useOrganization';
import type { OrgSettings } from '@/features/auth/types';

const TIMEZONES: { value: string; label: string }[] = [
  { value: 'America/New_York', label: 'Eastern (America/New_York)' },
  { value: 'America/Chicago', label: 'Central (America/Chicago)' },
  { value: 'America/Denver', label: 'Mountain (America/Denver)' },
  { value: 'America/Phoenix', label: 'Arizona (America/Phoenix)' },
  { value: 'America/Los_Angeles', label: 'Pacific (America/Los_Angeles)' },
  { value: 'America/Anchorage', label: 'Alaska (America/Anchorage)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii (Pacific/Honolulu)' },
  { value: 'UTC', label: 'UTC' },
];

const schema = z.object({
  defaultMarkupPercent: z
    .string()
    .regex(/^\d+(\.\d+)?$/, 'Decimal between 0 and 1')
    .refine((v) => {
      const n = Number(v);
      return n >= 0 && n <= 1;
    }, 'Must be between 0 and 1'),
  timezone: z.string().min(1),
});
type FormValues = z.infer<typeof schema>;

export function DefaultsSection({ settings }: { settings: OrgSettings }) {
  const patch = usePatchSettings();
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      defaultMarkupPercent: settings.defaultMarkupPercent ?? '0.20',
      timezone: settings.timezone,
    },
  });

  useEffect(() => {
    if (!savedAt) return;
    const t = window.setTimeout(() => setSavedAt(null), 2500);
    return () => window.clearTimeout(t);
  }, [savedAt]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      await patch.mutateAsync({
        defaultMarkupPercent: values.defaultMarkupPercent,
        timezone: values.timezone,
      });
      reset(values);
      setSavedAt(Date.now());
    } catch {
      // surfaced via patch.error banner
    }
  });

  const banner = patch.error ? backendErrorMessage(patch.error, 'Could not save defaults.') : null;
  const busy = isSubmitting || patch.isPending;

  return (
    <SectionShell index="E" label="defaults" saved={Boolean(savedAt)}>
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-5">
        {banner ? (
          <div
            role="alert"
            className="border border-mark-red/60 px-3 py-2 font-mono text-[10px] uppercase tracking-label text-mark-red"
          >
            {banner}
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-4">
          <Field
            label="Default markup"
            htmlFor="defaultMarkupPercent"
            error={errors.defaultMarkupPercent?.message}
          >
            <input
              id="defaultMarkupPercent"
              className={`${inputClass} font-mono`}
              placeholder="0.20"
              {...register('defaultMarkupPercent')}
            />
          </Field>
          <Field label="Timezone" htmlFor="timezone" error={errors.timezone?.message}>
            <select
              id="timezone"
              className={`${inputClass} bg-paper`}
              {...register('timezone')}
            >
              {TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <button
          type="submit"
          disabled={!isDirty || busy}
          className="self-start border border-ink bg-ink px-4 py-2 font-mono text-[11px] uppercase tracking-label text-ink-inverse transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save defaults'}
        </button>
      </form>
    </SectionShell>
  );
}
