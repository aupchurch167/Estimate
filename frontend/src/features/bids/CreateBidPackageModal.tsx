import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { Field, inputClass } from '@/features/auth/Field';
import { backendErrorMessage } from '@/features/auth/useAuth';
import { useCreateBidPackage, useTrades } from './useBids';

const schema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().max(5000).optional(),
  tradeCanonicalId: z.string().optional(),
  dueDate: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onClose: () => void;
  estimateId: string;
}

export function CreateBidPackageModal({ open, onClose, estimateId }: Props) {
  const navigate = useNavigate();
  const create = useCreateBidPackage();
  const tradesQuery = useTrades();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { title: '', description: '', tradeCanonicalId: '', dueDate: '' },
  });

  useEffect(() => {
    if (!open) {
      reset();
      create.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const onSubmit = handleSubmit(async (values) => {
    try {
      const trade = tradesQuery.data?.find((t) => t.id === values.tradeCanonicalId);
      const created = await create.mutateAsync({
        estimateId,
        title: values.title.trim(),
        description: values.description?.trim() || undefined,
        tradeCanonicalId: values.tradeCanonicalId || undefined,
        tradeCode: trade?.code,
        dueDate: values.dueDate || undefined,
      });
      onClose();
      navigate(`/app/bid-packages/${created.id}`);
    } catch {
      // surfaced via banner
    }
  });

  const banner = create.error
    ? backendErrorMessage(create.error, 'Could not create bid package.')
    : null;
  const busy = isSubmitting || create.isPending;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-bid-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[520px] border border-ink bg-paper-elevated p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-baseline justify-between border-b border-rule pb-3">
          <h2
            id="create-bid-title"
            className="font-mono text-[12px] uppercase tracking-title text-ink"
          >
            New bid package
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

          <Field label="Title" htmlFor="bid-title" error={errors.title?.message}>
            <input
              id="bid-title"
              autoFocus
              className={inputClass}
              placeholder="e.g. Electrical — Warehouse Buildout"
              {...register('title')}
            />
          </Field>

          <Field label="Trade" htmlFor="bid-trade">
            <select
              id="bid-trade"
              className={inputClass}
              {...register('tradeCanonicalId')}
            >
              <option value="">Select trade…</option>
              {(tradesQuery.data ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.code} — {t.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Due date" htmlFor="bid-due">
            <input
              id="bid-due"
              type="date"
              className={inputClass}
              {...register('dueDate')}
            />
          </Field>

          <Field label="Description" htmlFor="bid-desc" error={errors.description?.message}>
            <textarea
              id="bid-desc"
              className={inputClass}
              rows={3}
              placeholder="Scope notes for vendors…"
              {...register('description')}
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
              {busy ? 'Creating…' : 'Create bid package'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
