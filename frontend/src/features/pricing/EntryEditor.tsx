import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Field, inputClass } from '@/features/auth/Field';
import { backendErrorCode, backendErrorMessage } from '@/features/auth/useAuth';
import {
  useCreateEntry,
  useUpdateEntry,
  type EntryInput,
} from './usePricing';
import {
  UNITS_OF_MEASURE,
  type PriceBookCategory,
  type PriceBookEntry,
  type UnitOfMeasure,
} from './types';

const schema = z.object({
  categoryId: z.string().min(1, 'Category is required'),
  code: z.string().max(40).optional(),
  description: z.string().min(1, 'Description is required').max(500),
  unitOfMeasure: z.enum(UNITS_OF_MEASURE as unknown as [UnitOfMeasure, ...UnitOfMeasure[]]),
  unitCostMaterial: z.string().regex(/^\d+(\.\d+)?$/, 'Must be ≥ 0'),
  unitCostLabor: z.string().regex(/^\d+(\.\d+)?$/, 'Must be ≥ 0'),
  defaultMarkupPercent: z
    .string()
    .regex(/^\d+(\.\d+)?$/, '0–1')
    .refine((v) => Number(v) >= 0 && Number(v) <= 1, '0–1')
    .or(z.literal(''))
    .optional(),
  aiKeywords: z.string().max(2000).optional(),
});
type FormValues = z.infer<typeof schema>;

interface EntryEditorProps {
  priceBookId: string;
  open: boolean;
  onClose: () => void;
  categories: PriceBookCategory[];
  entry?: PriceBookEntry; // present → edit mode
  defaultCategoryId?: string;
}

export function EntryEditor({
  priceBookId,
  open,
  onClose,
  categories,
  entry,
  defaultCategoryId,
}: EntryEditorProps) {
  const create = useCreateEntry(priceBookId);
  const update = useUpdateEntry(priceBookId);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: blank(defaultCategoryId, categories),
  });

  useEffect(() => {
    if (!open) {
      create.reset();
      update.reset();
      return;
    }
    if (entry) {
      reset({
        categoryId: entry.categoryId,
        code: entry.code ?? '',
        description: entry.description,
        unitOfMeasure: entry.unitOfMeasure,
        unitCostMaterial: String(entry.unitCostMaterial),
        unitCostLabor: String(entry.unitCostLabor),
        defaultMarkupPercent: entry.defaultMarkupPercent ?? '',
        aiKeywords: entry.aiKeywords ?? '',
      });
    } else {
      reset(blank(defaultCategoryId, categories));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, entry?.id, defaultCategoryId]);

  if (!open) return null;

  const onSubmit = handleSubmit(async (values) => {
    const payload: EntryInput = {
      categoryId: values.categoryId,
      code: values.code?.trim() || null,
      description: values.description.trim(),
      unitOfMeasure: values.unitOfMeasure,
      unitCostMaterial: values.unitCostMaterial,
      unitCostLabor: values.unitCostLabor,
      defaultMarkupPercent: values.defaultMarkupPercent?.trim() || null,
      aiKeywords: values.aiKeywords?.trim() || null,
    };
    try {
      if (entry) {
        await update.mutateAsync({ id: entry.id, patch: payload });
      } else {
        await create.mutateAsync(payload);
      }
      onClose();
    } catch {
      // surfaced via banner below
    }
  });

  const err = create.error ?? update.error;
  const code = err ? backendErrorCode(err) : null;
  const banner = !err
    ? null
    : code === 'code_conflict'
      ? 'An entry with this code already exists. Pick a unique code or leave the field blank.'
      : backendErrorMessage(err, 'Could not save entry.');
  const busy = isSubmitting || create.isPending || update.isPending;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="entry-editor-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[640px] border border-ink bg-paper-elevated p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-baseline justify-between border-b border-rule pb-3">
          <h2
            id="entry-editor-title"
            className="font-mono text-[12px] uppercase tracking-title text-ink"
          >
            {entry ? 'Edit entry' : 'New entry'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="font-mono text-[10px] uppercase tracking-label text-dim hover:text-ink"
          >
            Close
          </button>
        </div>

        <form noValidate onSubmit={onSubmit} className="grid grid-cols-2 gap-4">
          {banner ? (
            <div
              role="alert"
              className="col-span-2 border border-mark-red/60 px-3 py-2 font-mono text-[10px] uppercase tracking-label text-mark-red"
            >
              {banner}
            </div>
          ) : null}

          <Field
            label="Category"
            htmlFor="entry-category"
            error={errors.categoryId?.message}
          >
            <select
              id="entry-category"
              className={`${inputClass} bg-paper`}
              {...register('categoryId')}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Code" htmlFor="entry-code" error={errors.code?.message}>
            <input id="entry-code" className={`${inputClass} font-mono`} {...register('code')} />
          </Field>

          <div className="col-span-2">
            <Field
              label="Description"
              htmlFor="entry-description"
              error={errors.description?.message}
            >
              <input
                id="entry-description"
                className={inputClass}
                {...register('description')}
              />
            </Field>
          </div>

          <Field label="UoM" htmlFor="entry-uom" error={errors.unitOfMeasure?.message}>
            <select
              id="entry-uom"
              className={`${inputClass} bg-paper`}
              {...register('unitOfMeasure')}
            >
              {UNITS_OF_MEASURE.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Default markup"
            htmlFor="entry-markup"
            error={errors.defaultMarkupPercent?.message}
          >
            <input
              id="entry-markup"
              className={`${inputClass} font-mono`}
              placeholder="0.20"
              {...register('defaultMarkupPercent')}
            />
          </Field>

          <Field
            label="Material $"
            htmlFor="entry-material"
            error={errors.unitCostMaterial?.message}
          >
            <input
              id="entry-material"
              className={`${inputClass} font-mono tabular-nums`}
              {...register('unitCostMaterial')}
            />
          </Field>

          <Field
            label="Labor $"
            htmlFor="entry-labor"
            error={errors.unitCostLabor?.message}
          >
            <input
              id="entry-labor"
              className={`${inputClass} font-mono tabular-nums`}
              {...register('unitCostLabor')}
            />
          </Field>

          <div className="col-span-2">
            <Field
              label="AI keywords"
              htmlFor="entry-keywords"
              error={errors.aiKeywords?.message}
            >
              <input
                id="entry-keywords"
                className={inputClass}
                placeholder="space-separated keywords for AI matching"
                {...register('aiKeywords')}
              />
            </Field>
          </div>

          <div className="col-span-2 mt-2 flex justify-end gap-3">
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
              {busy ? 'Saving…' : entry ? 'Save changes' : 'Create entry'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function blank(defaultCategoryId: string | undefined, categories: PriceBookCategory[]): FormValues {
  return {
    categoryId: defaultCategoryId ?? categories[0]?.id ?? '',
    code: '',
    description: '',
    unitOfMeasure: 'EA',
    unitCostMaterial: '0',
    unitCostLabor: '0',
    defaultMarkupPercent: '',
    aiKeywords: '',
  };
}
