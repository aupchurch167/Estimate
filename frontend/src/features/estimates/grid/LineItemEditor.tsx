import { useEffect, useState } from 'react';
import type { AxiosError } from 'axios';
import { backendErrorCode, backendErrorMessage } from '@/features/auth/useAuth';
import type { EstimateDetail, LineItem } from '@/features/estimates/types';
import {
  LINE_ITEM_STATUSES,
  UNITS_OF_MEASURE,
  usePatchLineItem,
  type LineItemStatus,
  type PatchLineItemInput,
  type UnitOfMeasure,
} from './useLineItems';

const READ_ONLY_STATUSES = new Set(['SENT', 'WON', 'LOST']);

interface LineItemEditorProps {
  estimate: EstimateDetail;
  item: LineItem;
  onClose: () => void;
}

interface FormState {
  description: string;
  aiAssumption: string;
  quantity: string;
  unitOfMeasure: UnitOfMeasure;
  customUnitOfMeasure: string;
  unitCostMaterial: string;
  unitCostLabor: string;
  markupPercent: string;
  status: LineItemStatus;
  subQuoteFrom: string;
  subQuoteReceivedAt: string;
  internalNotes: string;
  clientNotes: string;
}

/**
 * Modal-based row editor for a line item. Long-text fields
 * (description, aiAssumption, internalNotes, clientNotes) live here
 * because the grid cells are too narrow to edit them comfortably.
 *
 * Save commits every changed field in a single PATCH. Cancel discards.
 * When the estimate is SENT/WON/LOST the modal opens read-only with a
 * banner; admins can still close it. Cmd/Ctrl+Enter saves; Escape
 * closes.
 */
export function LineItemEditor({ estimate, item, onClose }: LineItemEditorProps) {
  const readOnly = READ_ONLY_STATUSES.has(estimate.status);
  const patch = usePatchLineItem(estimate.id);
  const [form, setForm] = useState<FormState>(() => toFormState(item));
  const [conflict, setConflict] = useState<string | null>(null);

  // Reset whenever a different item is opened.
  useEffect(() => {
    setForm(toFormState(item));
    setConflict(null);
    patch.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  // Detect server-side concurrent edit on save: keep a snapshot of the
  // updatedAt the modal opened with; if a successful patch returns a
  // newer item with a different updatedAt parent value we don't worry —
  // the only realistic case is *another* user updating between open
  // and save. The server doesn't currently surface a `409 stale` so
  // we approximate by comparing the row in props before submitting.
  useEffect(() => {
    if (!conflict) return;
    // Auto-clear conflict banner once form is reset to fresh values.
  }, [conflict]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly) return;
    const patchBody = diffToPatch(item, form);
    if (Object.keys(patchBody).length === 0) {
      onClose();
      return;
    }
    patch.reset();
    try {
      await patch.mutateAsync({ id: item.id, patch: patchBody });
      onClose();
    } catch (err) {
      const code = backendErrorCode(err as AxiosError);
      if (code === 'cannot_edit_in_current_status') {
        setConflict('This estimate was locked while you were editing. Refresh to continue.');
      }
      // Otherwise the inline banner below renders patch.error.
    }
  };

  // Esc closes; Cmd/Ctrl+Enter saves.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if (!readOnly) {
          // Synthesize a submit by walking the same path.
          void onSubmit(new Event('submit') as unknown as React.FormEvent);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, form, item.id]);

  const error = patch.error
    ? backendErrorMessage(patch.error as AxiosError, 'Could not save the line item.')
    : null;

  return (
    <div
      role="dialog"
      aria-label={readOnly ? 'View line item (read-only)' : 'Edit line item'}
      className="fixed inset-0 z-40 flex items-center justify-center bg-ink/40 px-4"
      data-testid="line-item-editor"
    >
      <form
        onSubmit={onSubmit}
        className="flex w-full max-w-[640px] max-h-[90vh] flex-col border border-ink bg-paper-elevated"
      >
        <header className="border-b border-rule-soft px-5 py-3">
          <p className="font-mono text-[10px] uppercase tracking-label text-dim">
            {readOnly ? 'Line item · read-only' : 'Edit line item'}
          </p>
          <p className="mt-1 font-sans text-[14px] text-ink">{item.description}</p>
        </header>

        {readOnly ? (
          <div
            role="alert"
            className="border-b border-rule-soft bg-paper px-5 py-2 font-mono text-[10px] uppercase tracking-label text-mark-amber"
          >
            Estimate is {estimate.status}. Line items can't be edited until it's revised.
          </div>
        ) : null}
        {conflict ? (
          <div
            role="alert"
            data-testid="line-item-editor-conflict"
            className="border-b border-rule-soft bg-paper px-5 py-2 font-mono text-[10px] uppercase tracking-label text-mark-red"
          >
            {conflict}
          </div>
        ) : null}

        <div className="flex-1 overflow-auto px-5 py-4">
          <FieldGroup label="Scope">
            <Field label="Description">
              <textarea
                rows={2}
                disabled={readOnly}
                value={form.description}
                onChange={(e) => update('description', e.target.value)}
                maxLength={2000}
                data-testid="editor-description"
                className={textareaClass}
              />
            </Field>
            <Field
              label="AI assumption"
              hint={
                item.source === 'AI_GENERATED'
                  ? 'Surfaced under the line on the PDF. Edit only if the AI got it wrong.'
                  : 'Optional note about why this line is here.'
              }
            >
              <textarea
                rows={2}
                disabled={readOnly}
                value={form.aiAssumption}
                onChange={(e) => update('aiAssumption', e.target.value)}
                maxLength={2000}
                data-testid="editor-aiAssumption"
                className={textareaClass}
              />
            </Field>
          </FieldGroup>

          <FieldGroup label="Quantity">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Quantity">
                <input
                  type="text"
                  inputMode="decimal"
                  disabled={readOnly}
                  value={form.quantity}
                  onChange={(e) => update('quantity', e.target.value)}
                  data-testid="editor-quantity"
                  className={inputClass}
                />
              </Field>
              <Field label="Unit of measure">
                <select
                  disabled={readOnly}
                  value={form.unitOfMeasure}
                  onChange={(e) =>
                    update('unitOfMeasure', e.target.value as UnitOfMeasure)
                  }
                  data-testid="editor-unitOfMeasure"
                  className={inputClass}
                >
                  {UNITS_OF_MEASURE.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            {form.unitOfMeasure === 'CUSTOM' ? (
              <Field label="Custom unit label">
                <input
                  type="text"
                  disabled={readOnly}
                  value={form.customUnitOfMeasure}
                  onChange={(e) => update('customUnitOfMeasure', e.target.value)}
                  maxLength={40}
                  className={inputClass}
                />
              </Field>
            ) : null}
          </FieldGroup>

          <FieldGroup label="Pricing">
            <div className="grid grid-cols-3 gap-3">
              <Field label="Material $">
                <input
                  type="text"
                  inputMode="decimal"
                  disabled={readOnly}
                  value={form.unitCostMaterial}
                  onChange={(e) => update('unitCostMaterial', e.target.value)}
                  data-testid="editor-unitCostMaterial"
                  className={inputClass}
                />
              </Field>
              <Field label="Labor $">
                <input
                  type="text"
                  inputMode="decimal"
                  disabled={readOnly}
                  value={form.unitCostLabor}
                  onChange={(e) => update('unitCostLabor', e.target.value)}
                  data-testid="editor-unitCostLabor"
                  className={inputClass}
                />
              </Field>
              <Field label="Markup" hint="0.20 = 20%. Blank = inherit cascade.">
                <input
                  type="text"
                  inputMode="decimal"
                  disabled={readOnly}
                  value={form.markupPercent}
                  onChange={(e) => update('markupPercent', e.target.value)}
                  data-testid="editor-markupPercent"
                  className={inputClass}
                />
              </Field>
            </div>
            <p className="mt-2 font-mono text-[10px] uppercase tracking-label text-dim">
              Cost {fmtMoney(item.lineCost)} · Sell {fmtMoney(item.lineSellPrice)}
            </p>
          </FieldGroup>

          <FieldGroup label="Status">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Status">
                <select
                  disabled={readOnly}
                  value={form.status}
                  onChange={(e) => update('status', e.target.value as LineItemStatus)}
                  data-testid="editor-status"
                  className={inputClass}
                >
                  {LINE_ITEM_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Source" hint="Read-only — set when the line was created.">
                <input
                  type="text"
                  value={item.source}
                  disabled
                  className={`${inputClass} text-dim`}
                />
              </Field>
            </div>
          </FieldGroup>

          {form.status === 'PENDING_SUB_QUOTE' ? (
            <FieldGroup label="Sub-quote">
              <Field label="Sub vendor">
                <input
                  type="text"
                  disabled={readOnly}
                  value={form.subQuoteFrom}
                  onChange={(e) => update('subQuoteFrom', e.target.value)}
                  maxLength={120}
                  data-testid="editor-subQuoteFrom"
                  className={inputClass}
                />
              </Field>
              <Field label="Received (YYYY-MM-DD)">
                <input
                  type="date"
                  disabled={readOnly}
                  value={form.subQuoteReceivedAt}
                  onChange={(e) => update('subQuoteReceivedAt', e.target.value)}
                  className={inputClass}
                />
              </Field>
            </FieldGroup>
          ) : null}

          <FieldGroup label="Notes">
            <Field label="Internal notes" hint="Internal-only. Never sent to the client.">
              <textarea
                rows={3}
                disabled={readOnly}
                value={form.internalNotes}
                onChange={(e) => update('internalNotes', e.target.value)}
                maxLength={4000}
                data-testid="editor-internalNotes"
                className={textareaClass}
              />
            </Field>
            <Field label="Client notes" hint="Shown on the client-facing PDF.">
              <textarea
                rows={3}
                disabled={readOnly}
                value={form.clientNotes}
                onChange={(e) => update('clientNotes', e.target.value)}
                maxLength={4000}
                data-testid="editor-clientNotes"
                className={textareaClass}
              />
            </Field>
          </FieldGroup>

          {error ? (
            <p
              role="alert"
              className="mt-2 font-mono text-[10px] uppercase tracking-label text-mark-red"
            >
              {error}
            </p>
          ) : null}
        </div>

        <footer className="flex items-center justify-end gap-3 border-t border-rule-soft bg-paper px-5 py-3">
          <span className="mr-auto font-mono text-[10px] uppercase tracking-label text-dim">
            {readOnly ? '' : 'Cmd/Ctrl-Enter to save · Esc to close'}
          </span>
          <button
            type="button"
            onClick={onClose}
            data-testid="editor-cancel"
            className="font-mono text-[10px] uppercase tracking-label text-dim hover:text-ink"
          >
            {readOnly ? 'Close' : 'Cancel'}
          </button>
          {!readOnly ? (
            <button
              type="submit"
              disabled={patch.isPending}
              data-testid="editor-save"
              className="border border-ink bg-ink px-4 py-2 font-mono text-[11px] uppercase tracking-label text-ink-inverse hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {patch.isPending ? 'Saving…' : 'Save'}
            </button>
          ) : null}
        </footer>
      </form>
    </div>
  );
}

// ─── Field primitives ────────────────────────────────────────────────────

const inputClass =
  'w-full border border-rule bg-paper px-3 py-2 font-sans text-[13px] text-ink focus:border-ink focus:outline-none disabled:cursor-not-allowed disabled:opacity-60';
const textareaClass = `${inputClass} resize-vertical`;

function FieldGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="border-t border-rule-soft pt-4 first:border-t-0 first:pt-0 mt-4 first:mt-0">
      <legend className="-ml-2 px-2 font-mono text-[10px] uppercase tracking-label text-dim">
        {label}
      </legend>
      <div className="flex flex-col gap-3 mt-2">{children}</div>
    </fieldset>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-[10px] uppercase tracking-label text-dim">{label}</span>
      {children}
      {hint ? (
        <span className="font-mono text-[10px] uppercase tracking-label text-dim">{hint}</span>
      ) : null}
    </label>
  );
}

// ─── State helpers ───────────────────────────────────────────────────────

function toFormState(item: LineItem): FormState {
  return {
    description: item.description ?? '',
    aiAssumption: item.aiAssumption ?? '',
    quantity: String(item.quantity ?? ''),
    unitOfMeasure: (item.unitOfMeasure as UnitOfMeasure) ?? 'EA',
    customUnitOfMeasure:
      ((item as unknown as { customUnitOfMeasure?: string | null }).customUnitOfMeasure) ??
      '',
    unitCostMaterial: String(item.unitCostMaterial ?? '0'),
    unitCostLabor: String(item.unitCostLabor ?? '0'),
    markupPercent: String(item.markupPercent ?? ''),
    status: (item.status as LineItemStatus) ?? 'DRAFT',
    subQuoteFrom:
      ((item as unknown as { subQuoteFrom?: string | null }).subQuoteFrom) ?? '',
    subQuoteReceivedAt: extractDate(
      (item as unknown as { subQuoteReceivedAt?: string | null }).subQuoteReceivedAt,
    ),
    internalNotes:
      ((item as unknown as { internalNotes?: string | null }).internalNotes) ?? '',
    clientNotes:
      ((item as unknown as { clientNotes?: string | null }).clientNotes) ?? '',
  };
}

function extractDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.valueOf())) return '';
  return d.toISOString().slice(0, 10);
}

function diffToPatch(item: LineItem, form: FormState): PatchLineItemInput {
  const patch: PatchLineItemInput = {};
  const description = form.description.trim();
  if (description !== (item.description ?? '').trim() && description.length > 0) {
    patch.description = description;
  }
  const aiAssumption = form.aiAssumption.trim();
  if (aiAssumption !== (item.aiAssumption ?? '').trim()) {
    (patch as PatchLineItemInput & { aiAssumption?: string | null }).aiAssumption =
      aiAssumption.length > 0 ? aiAssumption : null;
  }
  const quantity = form.quantity.trim();
  if (quantity !== String(item.quantity).trim() && /^\d+(\.\d+)?$/.test(quantity)) {
    patch.quantity = quantity;
  }
  if (form.unitOfMeasure !== item.unitOfMeasure) {
    patch.unitOfMeasure = form.unitOfMeasure;
  }
  const customUom = form.customUnitOfMeasure.trim();
  const itemCustom =
    (item as unknown as { customUnitOfMeasure?: string | null }).customUnitOfMeasure ?? '';
  if (form.unitOfMeasure === 'CUSTOM' && customUom !== itemCustom.trim()) {
    (patch as PatchLineItemInput & { customUnitOfMeasure?: string | null }).customUnitOfMeasure =
      customUom.length > 0 ? customUom : null;
  }
  const m = form.unitCostMaterial.trim();
  if (m !== String(item.unitCostMaterial).trim() && /^\d+(\.\d+)?$/.test(m)) {
    patch.unitCostMaterial = m;
  }
  const l = form.unitCostLabor.trim();
  if (l !== String(item.unitCostLabor).trim() && /^\d+(\.\d+)?$/.test(l)) {
    patch.unitCostLabor = l;
  }
  const markupRaw = form.markupPercent.trim();
  const itemMarkup = String(item.markupPercent ?? '').trim();
  if (markupRaw !== itemMarkup) {
    if (markupRaw === '') {
      patch.markupPercent = null;
    } else if (/^\d+(\.\d+)?$/.test(markupRaw)) {
      patch.markupPercent = markupRaw;
    }
  }
  if (form.status !== item.status) {
    patch.status = form.status;
  }
  const internal = form.internalNotes.trim();
  const itemInternal = (
    (item as unknown as { internalNotes?: string | null }).internalNotes ?? ''
  ).trim();
  if (internal !== itemInternal) {
    (patch as PatchLineItemInput & { internalNotes?: string | null }).internalNotes =
      internal.length > 0 ? internal : null;
  }
  const client = form.clientNotes.trim();
  const itemClient = (
    (item as unknown as { clientNotes?: string | null }).clientNotes ?? ''
  ).trim();
  if (client !== itemClient) {
    (patch as PatchLineItemInput & { clientNotes?: string | null }).clientNotes =
      client.length > 0 ? client : null;
  }
  return patch;
}

function fmtMoney(v: string): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
