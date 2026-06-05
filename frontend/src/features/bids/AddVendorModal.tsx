import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Field, inputClass } from '@/features/auth/Field';
import { backendErrorMessage } from '@/features/auth/useAuth';
import { useAddBidRequest } from './useBids';

const schema = z.object({
  vendorName: z.string().min(1, 'Vendor name is required').max(200),
  vendorEmail: z.string().email('Valid email required'),
  vendorPhone: z.string().max(30).optional(),
});
type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onClose: () => void;
  bidPackageId: string;
}

export function AddVendorModal({ open, onClose, bidPackageId }: Props) {
  const addRequest = useAddBidRequest();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { vendorName: '', vendorEmail: '', vendorPhone: '' },
  });

  useEffect(() => {
    if (!open) {
      reset();
      addRequest.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const onSubmit = handleSubmit(async (values) => {
    try {
      await addRequest.mutateAsync({
        bidPackageId,
        vendorName: values.vendorName.trim(),
        vendorEmail: values.vendorEmail.trim().toLowerCase(),
        vendorPhone: values.vendorPhone?.trim() || undefined,
      });
      onClose();
    } catch {
      // surfaced via banner
    }
  });

  const banner = addRequest.error
    ? backendErrorMessage(addRequest.error, 'Could not add vendor.')
    : null;
  const busy = isSubmitting || addRequest.isPending;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-vendor-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[480px] border border-ink bg-paper-elevated p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-baseline justify-between border-b border-rule pb-3">
          <h2
            id="add-vendor-title"
            className="font-mono text-[12px] uppercase tracking-title text-ink"
          >
            Add vendor
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="font-mono text-[10px] uppercase tracking-label text-dim hover:text-ink"
          >
            Close
          </button>
        </div>

        <form noValidate onSubmit={onSubmit} className="flex flex-col gap-5">
          {banner && (
            <div
              role="alert"
              className="border border-mark-red/60 px-3 py-2 font-mono text-[10px] uppercase tracking-label text-mark-red"
            >
              {banner}
            </div>
          )}

          <Field label="Vendor name" htmlFor="vendor-name" error={errors.vendorName?.message}>
            <input
              id="vendor-name"
              autoFocus
              className={inputClass}
              placeholder="e.g. Apex Electrical Inc."
              {...register('vendorName')}
            />
          </Field>

          <Field label="Email" htmlFor="vendor-email" error={errors.vendorEmail?.message}>
            <input
              id="vendor-email"
              type="email"
              className={inputClass}
              placeholder="bids@vendor.com"
              {...register('vendorEmail')}
            />
          </Field>

          <Field label="Phone (optional)" htmlFor="vendor-phone" error={errors.vendorPhone?.message}>
            <input
              id="vendor-phone"
              type="tel"
              className={inputClass}
              placeholder="(555) 123-4567"
              {...register('vendorPhone')}
            />
          </Field>

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
              {busy ? 'Adding…' : 'Add vendor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
