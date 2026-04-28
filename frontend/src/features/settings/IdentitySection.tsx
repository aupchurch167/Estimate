import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Field, inputClass } from '@/features/auth/Field';
import { backendErrorMessage } from '@/features/auth/useAuth';
import { SectionShell } from './SectionShell';
import { usePatchOrganization, usePatchSettings } from './useOrganization';
import type { Organization, OrgSettings } from '@/features/auth/types';

const schema = z.object({
  name: z.string().min(1, 'Required').max(120),
  companyLegalName: z.string().max(120).optional(),
  estimateNumberPrefix: z
    .string()
    .regex(/^[a-zA-Z0-9]{2,5}$/, '2–5 letters or digits'),
  contactPhone: z.string().max(40).optional(),
  contactEmail: z.string().email('Enter a valid email').or(z.literal('')).optional(),
  addressLine1: z.string().max(120).optional(),
  city: z.string().max(80).optional(),
  state: z.string().max(40).optional(),
  postalCode: z.string().max(20).optional(),
});
type FormValues = z.infer<typeof schema>;

export function IdentitySection({
  organization,
  settings,
}: {
  organization: Organization;
  settings: OrgSettings;
}) {
  const patchOrg = usePatchOrganization();
  const patchSettings = usePatchSettings();
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: organization.name,
      companyLegalName: settings.companyLegalName ?? '',
      estimateNumberPrefix: settings.estimateNumberPrefix,
      contactPhone: settings.contactPhone ?? '',
      contactEmail: settings.contactEmail ?? '',
      addressLine1: '',
      city: '',
      state: '',
      postalCode: '',
    },
  });

  useEffect(() => {
    if (!savedAt) return;
    const t = window.setTimeout(() => setSavedAt(null), 2500);
    return () => window.clearTimeout(t);
  }, [savedAt]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      const tasks: Promise<unknown>[] = [];
      if (values.name !== organization.name) {
        tasks.push(patchOrg.mutateAsync({ name: values.name }));
      }
      const settingsPatch = {
        companyLegalName: values.companyLegalName?.trim() || null,
        estimateNumberPrefix: values.estimateNumberPrefix,
        contactPhone: values.contactPhone?.trim() || null,
        contactEmail: values.contactEmail?.trim() || null,
        addressLine1: values.addressLine1?.trim() || null,
        city: values.city?.trim() || null,
        state: values.state?.trim() || null,
        postalCode: values.postalCode?.trim() || null,
      };
      tasks.push(patchSettings.mutateAsync(settingsPatch));
      await Promise.all(tasks);
      reset(values);
      setSavedAt(Date.now());
    } catch {
      // banner picks it up via patchSettings.error / patchOrg.error
    }
  });

  const error = patchSettings.error ?? patchOrg.error;
  const banner = error ? backendErrorMessage(error, 'Could not save identity.') : null;
  const busy = isSubmitting || patchSettings.isPending || patchOrg.isPending;

  return (
    <SectionShell index="A" label="identity" saved={Boolean(savedAt)}>
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-5">
        {banner ? (
          <div
            role="alert"
            className="border border-mark-red/60 px-3 py-2 font-mono text-[10px] uppercase tracking-label text-mark-red"
          >
            {banner}
          </div>
        ) : null}

        <Field label="Display name" htmlFor="name" error={errors.name?.message}>
          <input id="name" className={inputClass} {...register('name')} />
        </Field>
        <Field
          label="Legal name"
          htmlFor="companyLegalName"
          error={errors.companyLegalName?.message}
        >
          <input
            id="companyLegalName"
            className={inputClass}
            {...register('companyLegalName')}
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field
            label="Estimate prefix"
            htmlFor="estimateNumberPrefix"
            error={errors.estimateNumberPrefix?.message}
          >
            <input
              id="estimateNumberPrefix"
              className={`${inputClass} uppercase tracking-title`}
              {...register('estimateNumberPrefix')}
            />
          </Field>
          <Field
            label="Phone"
            htmlFor="contactPhone"
            error={errors.contactPhone?.message}
          >
            <input id="contactPhone" className={inputClass} {...register('contactPhone')} />
          </Field>
        </div>
        <Field
          label="Contact email"
          htmlFor="contactEmail"
          error={errors.contactEmail?.message}
        >
          <input
            id="contactEmail"
            type="email"
            className={inputClass}
            {...register('contactEmail')}
          />
        </Field>

        <button
          type="submit"
          disabled={!isDirty || busy}
          className="self-start border border-ink bg-ink px-4 py-2 font-mono text-[11px] uppercase tracking-label text-ink-inverse transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save identity'}
        </button>
      </form>
    </SectionShell>
  );
}
