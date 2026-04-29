import { useState } from 'react';
import type { LineItem } from '@/features/estimates/types';
import { CellEditor, SelectEditor } from './CellEditor';
import {
  UNITS_OF_MEASURE,
  type UnitOfMeasure,
  type PatchLineItemInput,
} from './useLineItems';

// Inline-editable fields. Long-text fields (description, aiAssumption,
// internalNotes, clientNotes) are NOT inline-editable — they're edited
// in LineItemEditor instead.
type EditableField =
  | 'quantity'
  | 'unitOfMeasure'
  | 'unitCostMaterial'
  | 'unitCostLabor'
  | 'markupPercent';

// Status → left-border accent color. Replaces the dedicated Status
// column per the layout iteration; the colored stripe on the row is
// enough signal at a glance.
const STATUS_ACCENT: Record<string, string> = {
  AI_GENERATED: 'border-l-text-tertiary',
  CONFIRMED: 'border-l-success',
  NEEDS_REVIEW: 'border-l-warning',
  ASSUMED: 'border-l-warning',
  NO_PRICE: 'border-l-danger',
  PENDING_SUB_QUOTE: 'border-l-info',
  DRAFT: 'border-l-border-primary',
  MANUAL: 'border-l-border-primary',
};

interface GridRowProps {
  item: LineItem;
  selected: boolean;
  readOnly: boolean;
  onToggleSelect: () => void;
  onPatch: (patch: PatchLineItemInput) => void;
  onDelete: () => void;
  onFocus: () => void;
  /** Open the modal editor (long-text fields, status, sub-quote, notes). */
  onOpenEditor: () => void;
  focused: boolean;
}

export function GridRow({
  item,
  selected,
  readOnly,
  onToggleSelect,
  onPatch,
  onDelete,
  onFocus,
  onOpenEditor,
  focused,
}: GridRowProps) {
  const [editing, setEditing] = useState<EditableField | null>(null);

  const accent =
    STATUS_ACCENT[item.status] ?? STATUS_ACCENT[item.source] ?? 'border-l-border-primary';

  const startEdit = (field: EditableField) => {
    if (readOnly) return;
    setEditing(field);
  };
  const finishEdit = () => setEditing(null);
  const commit = (patch: PatchLineItemInput) => {
    setEditing(null);
    onPatch(patch);
  };

  const tdClass = (extra = '') =>
    `border-r border-border-primary px-2 py-1.5 align-middle ${extra}`;

  // Editable cells: Tab into one and you're immediately in edit mode
  // (no extra Enter to drop into the input). Click and Enter / Space
  // also start editing for mouse + screen-reader users.
  //
  // We only auto-start on a *real* focus event from outside the cell —
  // the e.relatedTarget check prevents an infinite focus → edit → blur
  // → focus loop when the editor's input commits and refocuses.
  const editableProps = (field: EditableField) => ({
    tabIndex: readOnly ? -1 : 0,
    role: readOnly ? undefined : ('button' as const),
    'aria-label': readOnly ? undefined : `Edit ${field}`,
    onFocus: (e: React.FocusEvent<HTMLTableCellElement>) => {
      if (readOnly) return;
      // If focus came from inside this cell (e.g. the editor input
      // committed and bubbled focus back), don't re-enter edit mode.
      const cell = e.currentTarget;
      if (cell.contains(e.relatedTarget as Node | null)) return;
      if (editing !== null) return;
      startEdit(field);
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (readOnly) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        startEdit(field);
      }
    },
  });

  return (
    <tr
      data-testid={`row-${item.id}`}
      tabIndex={0}
      onFocus={onFocus}
      onKeyDown={(e) => {
        // Enter on the row itself (not on a cell) opens the modal editor.
        if (e.key === 'Enter' && editing === null && e.currentTarget === e.target) {
          e.preventDefault();
          onOpenEditor();
        }
      }}
      className={`group border-b border-border-primary border-l-[3px] ${accent} ${
        selected ? 'bg-bg-tertiary' : ''
      } ${focused ? 'outline outline-1 outline-border-focus/40' : ''} hover:bg-bg-tertiary`}
    >
      <td className={tdClass('w-8 text-center')}>
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          aria-label="Select row"
          className="cursor-pointer"
        />
      </td>
      <td
        className={tdClass('cursor-pointer w-[280px] max-w-[280px]')}
        onClick={onOpenEditor}
        data-testid={`row-${item.id}-description`}
      >
        <p
          className="truncate text-[14px] text-text-primary"
          title={item.description}
        >
          {item.description}
        </p>
        {item.aiAssumption ? (
          <p
            className="mt-0.5 text-[12px] text-warning"
            title={item.aiAssumption}
          >
            <span className="font-medium">Assumes:</span> {item.aiAssumption}
          </p>
        ) : null}
      </td>
      <td
        className={tdClass('w-20 text-right')}
        onClick={() => editing === null && startEdit('quantity')}
        {...editableProps('quantity')}
      >
        {editing === 'quantity' ? (
          <CellEditor
            initialValue={String(item.quantity)}
            type="number"
            align="right"
            onCancel={finishEdit}
            onCommit={(v) => commit({ quantity: v })}
          />
        ) : (
          <span className="font-mono text-[13px] tabular-nums text-text-primary">
            {fmtQty(item.quantity)}
          </span>
        )}
      </td>
      <td
        className={tdClass('w-20 text-center')}
        onClick={() => editing === null && startEdit('unitOfMeasure')}
        {...editableProps('unitOfMeasure')}
      >
        {editing === 'unitOfMeasure' ? (
          <SelectEditor<UnitOfMeasure>
            initialValue={item.unitOfMeasure as UnitOfMeasure}
            options={UNITS_OF_MEASURE}
            onCancel={finishEdit}
            onCommit={(v) => commit({ unitOfMeasure: v })}
          />
        ) : (
          <span className="text-[12px] font-medium uppercase tracking-[0.04em] text-text-secondary">
            {item.unitOfMeasure}
          </span>
        )}
      </td>
      <td
        className={tdClass('w-20 text-right')}
        onClick={() => editing === null && startEdit('unitCostMaterial')}
        {...editableProps('unitCostMaterial')}
      >
        {editing === 'unitCostMaterial' ? (
          <CellEditor
            initialValue={String(item.unitCostMaterial)}
            type="number"
            align="right"
            onCancel={finishEdit}
            onCommit={(v) => commit({ unitCostMaterial: v })}
          />
        ) : (
          <span className="font-mono text-[13px] tabular-nums text-text-primary">
            {fmtMoney(item.unitCostMaterial)}
          </span>
        )}
      </td>
      <td
        className={tdClass('w-20 text-right')}
        onClick={() => editing === null && startEdit('unitCostLabor')}
        {...editableProps('unitCostLabor')}
      >
        {editing === 'unitCostLabor' ? (
          <CellEditor
            initialValue={String(item.unitCostLabor)}
            type="number"
            align="right"
            onCancel={finishEdit}
            onCommit={(v) => commit({ unitCostLabor: v })}
          />
        ) : (
          <span className="font-mono text-[13px] tabular-nums text-text-primary">
            {fmtMoney(item.unitCostLabor)}
          </span>
        )}
      </td>
      <td
        className={tdClass('w-20 text-right')}
        onClick={() => editing === null && startEdit('markupPercent')}
        {...editableProps('markupPercent')}
      >
        {editing === 'markupPercent' ? (
          <CellEditor
            initialValue={String(item.markupPercent)}
            type="number"
            align="right"
            onCancel={finishEdit}
            onCommit={(v) => commit({ markupPercent: v })}
          />
        ) : (
          <span className="font-mono text-[12px] tabular-nums text-text-secondary">
            {fmtPct(item.markupPercent)}
          </span>
        )}
      </td>
      <td className={tdClass('w-20 text-right')}>
        <span className="font-mono text-[12px] tabular-nums text-text-secondary">
          {fmtMoney(item.lineCost)}
        </span>
      </td>
      <td className={tdClass('w-24 text-right')}>
        <span className="font-mono text-[14px] font-semibold tabular-nums text-text-primary">
          {fmtMoney(item.lineSellPrice)}
        </span>
      </td>
      <td className="w-12 px-2 py-1.5 align-middle text-right">
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            aria-label="Open editor"
            onClick={onOpenEditor}
            data-testid={`row-${item.id}-expand`}
            className="rounded p-1 text-text-tertiary opacity-0 transition-opacity duration-fast hover:bg-bg-secondary hover:text-text-primary focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus group-hover:opacity-100"
            title="Open full editor"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M11 2h3v3M14 2L9 7M5 14H2v-3M2 14l5-5"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          {!readOnly ? (
            <button
              type="button"
              aria-label="Delete line"
              onClick={onDelete}
              className="rounded p-1 text-text-tertiary opacity-0 transition-opacity duration-fast hover:bg-danger-light hover:text-danger focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus group-hover:opacity-100"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M4 4l8 8M12 4l-8 8"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

function fmtQty(v: string): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function fmtMoney(v: string): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(v: string): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  return `${(n * 100).toFixed(0)}%`;
}
