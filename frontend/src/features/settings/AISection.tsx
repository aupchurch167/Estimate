import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Field, inputClass } from '@/features/auth/Field';
import { backendErrorMessage } from '@/features/auth/useAuth';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { SectionShell } from './SectionShell';
import { usePatchSettings } from './useOrganization';
import type { OrgSettings } from '@/features/auth/types';

const schema = z.object({
  monthlyAiCostCapUsd: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, 'Use a non-negative number')
    .refine((v) => Number(v) >= 0, 'Must be ≥ 0'),
});
type FormValues = z.infer<typeof schema>;

export function AISection({ settings }: { settings: OrgSettings }) {
  const patch = usePatchSettings();
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      monthlyAiCostCapUsd: settings.monthlyAiCostCapUsd ?? '',
    },
  });

  useEffect(() => {
    if (!savedAt) return;
    const t = window.setTimeout(() => setSavedAt(null), 2500);
    return () => window.clearTimeout(t);
  }, [savedAt]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      await patch.mutateAsync({ monthlyAiCostCapUsd: values.monthlyAiCostCapUsd });
      reset(values);
      setSavedAt(Date.now());
    } catch {
      // surfaced via patch.error banner
    }
  });

  const onRemoveCap = () => setConfirmOpen(true);
  const confirmRemoveCap = async () => {
    setConfirmOpen(false);
    try {
      await patch.mutateAsync({ monthlyAiCostCapUsd: null, confirmUnlimited: true });
      reset({ monthlyAiCostCapUsd: '' });
      setSavedAt(Date.now());
    } catch {
      // surfaced
    }
  };

  const banner = patch.error ? backendErrorMessage(patch.error, 'Could not save AI cap.') : null;
  const busy = isSubmitting || patch.isPending;
  const isUnlimited = settings.monthlyAiCostCapUsd === null;

  return (
    <SectionShell index="D" label="ai cost cap" saved={Boolean(savedAt)}>
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-5">
        {banner ? (
          <div
            role="alert"
            className="border border-mark-red/60 px-3 py-2 font-mono text-[10px] uppercase tracking-label text-mark-red"
          >
            {banner}
          </div>
        ) : null}

        <p className="max-w-[60ch] font-sans text-[12px] text-dim">
          When the org's calendar-month AI spend reaches this cap, new generation runs are blocked
          until next month or the cap changes. Leave a number to enforce; click "Remove cap" to set
          unlimited (with confirmation).
        </p>

        <Field
          label="Monthly cap (USD)"
          htmlFor="monthlyAiCostCapUsd"
          error={errors.monthlyAiCostCapUsd?.message}
        >
          <div className="flex items-center gap-3">
            <span
              className="font-mono text-[11px] uppercase tracking-label text-dim"
              aria-hidden
            >
              $
            </span>
            <input
              id="monthlyAiCostCapUsd"
              className={`${inputClass} font-mono`}
              placeholder={isUnlimited ? 'Unlimited' : '100'}
              {...register('monthlyAiCostCapUsd')}
            />
          </div>
        </Field>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={!isDirty || busy}
            className="border border-ink bg-ink px-4 py-2 font-mono text-[11px] uppercase tracking-label text-ink-inverse transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save cap'}
          </button>
          <button
            type="button"
            onClick={onRemoveCap}
            disabled={busy || isUnlimited}
            className="border border-mark-red/60 px-4 py-2 font-mono text-[11px] uppercase tracking-label text-mark-red transition hover:bg-mark-red hover:text-ink-inverse disabled:cursor-not-allowed disabled:opacity-50"
          >
            Remove cap (unlimited)
          </button>
        </div>
      </form>

      <ConfirmDialog
        open={confirmOpen}
        title="Remove monthly AI cap?"
        body={
          <p>
            Without a cap your org can spend any amount on AI runs in a month. You can re-enable a
            cap at any time.
          </p>
        }
        confirmLabel="Set unlimited"
        cancelLabel="Cancel"
        destructive
        onConfirm={confirmRemoveCap}
        onCancel={() => setConfirmOpen(false)}
      />
    </SectionShell>
  );
}
