import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { Field, inputClass } from '@/features/auth/Field';
import { backendErrorMessage } from '@/features/auth/useAuth';
import { Combobox } from '@/components/ui';
import { useCreateEstimate } from './useEstimates';
import { useCoreAccounts, useCoreDeals } from './useCoreEntities';
import type { CoreAccount, CoreDeal } from './useCoreEntities';

const schema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  clientCompanyName: z.string().max(200).optional(),
  projectAddressLine1: z.string().max(200).optional(),
  projectCity: z.string().max(80).optional(),
  projectState: z.string().max(40).optional(),
  projectPostalCode: z.string().max(20).optional(),
});
type FormValues = z.infer<typeof schema>;

interface CreateEstimateModalProps {
  open: boolean;
  onClose: () => void;
}

export function CreateEstimateModal({ open, onClose }: CreateEstimateModalProps) {
  const navigate = useNavigate();
  const create = useCreateEstimate();

  const [accountSearch, setAccountSearch] = useState('');
  const [selectedAccount, setSelectedAccount] = useState<CoreAccount | null>(null);
  const [selectedDeal, setSelectedDeal] = useState<CoreDeal | null>(null);

  const accountsQuery = useCoreAccounts(accountSearch);
  const dealsQuery = useCoreDeals(selectedAccount?.id ?? null);

  const coreEnabled = accountsQuery.data?.enabled ?? false;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: '',
      clientCompanyName: '',
      projectAddressLine1: '',
      projectCity: '',
      projectState: '',
      projectPostalCode: '',
    },
  });

  useEffect(() => {
    if (!open) {
      reset();
      create.reset();
      setAccountSearch('');
      setSelectedAccount(null);
      setSelectedDeal(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const onSubmit = handleSubmit(async (values) => {
    try {
      const created = await create.mutateAsync({
        title: values.title.trim(),
        clientCompanyName: selectedAccount?.name ?? values.clientCompanyName?.trim() ?? null,
        projectAddressLine1: values.projectAddressLine1?.trim() || null,
        projectCity: values.projectCity?.trim() || null,
        projectState: values.projectState?.trim() || null,
        projectPostalCode: values.projectPostalCode?.trim() || null,
        ...(coreEnabled
          ? {
              coreAccountId: selectedAccount?.id ?? null,
              coreDealId: selectedDeal?.id ?? null,
            }
          : {}),
      });
      onClose();
      navigate(`/app/estimates/${created.id}`);
    } catch {
      // surfaced via banner
    }
  });

  const banner = create.error
    ? backendErrorMessage(create.error, 'Could not create estimate.')
    : null;
  const busy = isSubmitting || create.isPending;

  const accountOptions = (accountsQuery.data?.data ?? []).map((a) => ({
    id: a.id,
    label: a.name,
    sublabel: [a.industry, a.city && a.state ? `${a.city}, ${a.state}` : a.city ?? a.state]
      .filter(Boolean)
      .join(' · ') || undefined,
  }));

  const dealOptions = (dealsQuery.data?.data ?? []).map((d) => ({
    id: d.id,
    label: d.name,
    sublabel: d.stage,
  }));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-est-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[520px] border border-ink bg-paper-elevated p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-baseline justify-between border-b border-rule pb-3">
          <h2
            id="create-est-title"
            className="font-mono text-[12px] uppercase tracking-title text-ink"
          >
            New estimate
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
          {banner ? (
            <div
              role="alert"
              className="border border-mark-red/60 px-3 py-2 font-mono text-[10px] uppercase tracking-label text-mark-red"
            >
              {banner}
            </div>
          ) : null}

          <Field label="Title" htmlFor="est-title" error={errors.title?.message}>
            <input
              id="est-title"
              autoFocus
              className={inputClass}
              placeholder="e.g. Acme Corp Suite 400 TI"
              {...register('title')}
            />
          </Field>

          {coreEnabled ? (
            <>
              <Field label="Client company" htmlFor="est-client">
                <Combobox
                  id="est-client"
                  placeholder="Search accounts…"
                  options={accountOptions}
                  selectedId={selectedAccount?.id ?? null}
                  selectedLabel={selectedAccount?.name ?? ''}
                  loading={accountsQuery.isFetching}
                  onQueryChange={setAccountSearch}
                  onSelect={(opt) => {
                    const account = (accountsQuery.data?.data ?? []).find((a) => a.id === opt.id);
                    setSelectedAccount(account ?? null);
                    setSelectedDeal(null);
                  }}
                  onClear={() => {
                    setSelectedAccount(null);
                    setSelectedDeal(null);
                  }}
                />
              </Field>

              {selectedAccount ? (
                <Field label="Deal" htmlFor="est-deal">
                  <p className="mb-1 font-mono text-[10px] tracking-label text-dim">
                    {selectedAccount.name}
                  </p>
                  <Combobox
                    id="est-deal"
                    placeholder="Select a deal (optional)…"
                    options={dealOptions}
                    selectedId={selectedDeal?.id ?? null}
                    selectedLabel={selectedDeal?.name ?? ''}
                    loading={dealsQuery.isFetching}
                    onQueryChange={() => {}}
                    onSelect={(opt) => {
                      const deal = (dealsQuery.data?.data ?? []).find((d) => d.id === opt.id);
                      setSelectedDeal(deal ?? null);
                    }}
                    onClear={() => setSelectedDeal(null)}
                  />
                </Field>
              ) : null}
            </>
          ) : (
            <Field
              label="Client company"
              htmlFor="est-client"
              error={errors.clientCompanyName?.message}
            >
              <input id="est-client" className={inputClass} {...register('clientCompanyName')} />
            </Field>
          )}

          <Field
            label="Project address"
            htmlFor="est-address"
            error={errors.projectAddressLine1?.message}
          >
            <input
              id="est-address"
              className={inputClass}
              placeholder="123 Main St"
              {...register('projectAddressLine1')}
            />
          </Field>

          <div className="grid grid-cols-3 gap-4">
            <Field label="City" htmlFor="est-city" error={errors.projectCity?.message}>
              <input id="est-city" className={inputClass} {...register('projectCity')} />
            </Field>
            <Field label="State" htmlFor="est-state" error={errors.projectState?.message}>
              <input id="est-state" className={inputClass} {...register('projectState')} />
            </Field>
            <Field label="ZIP" htmlFor="est-zip" error={errors.projectPostalCode?.message}>
              <input
                id="est-zip"
                className={`${inputClass} font-mono`}
                {...register('projectPostalCode')}
              />
            </Field>
          </div>

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
              {busy ? 'Creating…' : 'Create estimate'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
