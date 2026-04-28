import { useState } from 'react';
import type { LineItem } from '@/features/estimates/types';
import { CellEditor, SelectEditor } from './CellEditor';
import {
  UNITS_OF_MEASURE,
  type UnitOfMeasure,
  type PatchLineItemInput,
} from './useLineItems';

type EditableField =
  | 'description'
  | 'quantity'
  | 'unitOfMeasure'
  | 'unitCostMaterial'
  | 'unitCostLabor'
  | 'markupPercent';

const STATUS_ACCENT: Record<string, string> = {
  AI_GENERATED: 'border-l-dim',
  CONFIRMED: 'border-l-mark-green',
  NEEDS_REVIEW: 'border-l-mark-amber',
  ASSUMED: 'border-l-mark-amber',
  NO_PRICE: 'border-l-mark-red',
  PENDING_SUB_QUOTE: 'border-l-blueprint',
  DRAFT: 'border-l-rule',
  MANUAL: 'border-l-rule',
};

interface GridRowProps {
  item: LineItem;
  selected: boolean;
  readOnly: boolean;
  onToggleSelect: () => void;
  onPatch: (patch: PatchLineItemInput) => void;
  onDelete: () => void;
  onFocus: () => void;
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
  focused,
}: GridRowProps) {
  const [editing, setEditing] = useState<EditableField | null>(null);

  const accent =
    STATUS_ACCENT[item.status] ?? STATUS_ACCENT[item.source] ?? 'border-l-rule';

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
    `border-r border-rule-soft px-2 py-1 align-middle ${extra}`;

  return (
    <tr
      data-testid={`row-${item.id}`}
      tabIndex={0}
      onFocus={onFocus}
      onKeyDown={(e) => {
        if (readOnly) return;
        if (e.key === 'Enter' && editing === null) {
          e.preventDefault();
          startEdit('description');
        }
      }}
      className={`group border-b border-rule-soft border-l-[3px] ${accent} ${
        selected ? 'bg-paper' : ''
      } ${focused ? 'outline outline-1 outline-ink/30' : ''} hover:bg-paper`}
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
      <td className={tdClass('w-24')}>
        <span className="font-mono text-[10px] uppercase tracking-label text-dim">
          {labelStatus(item.status)}
        </span>
      </td>
      <td
        className={tdClass()}
        onClick={() => editing === null && startEdit('description')}
      >
        {editing === 'description' ? (
          <CellEditor
            initialValue={item.description}
            onCancel={finishEdit}
            onCommit={(v) => commit({ description: v })}
          />
        ) : (
          <span className="cursor-text font-sans text-[12px] text-ink">{item.description}</span>
        )}
      </td>
      <td
        className={tdClass('w-20 text-right')}
        onClick={() => editing === null && startEdit('quantity')}
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
          <span className="font-mono text-[12px] tabular-nums">{fmtQty(item.quantity)}</span>
        )}
      </td>
      <td
        className={tdClass('w-20 text-center')}
        onClick={() => editing === null && startEdit('unitOfMeasure')}
      >
        {editing === 'unitOfMeasure' ? (
          <SelectEditor<UnitOfMeasure>
            initialValue={item.unitOfMeasure as UnitOfMeasure}
            options={UNITS_OF_MEASURE}
            onCancel={finishEdit}
            onCommit={(v) => commit({ unitOfMeasure: v })}
          />
        ) : (
          <span className="font-mono text-[10px] uppercase tracking-label">{item.unitOfMeasure}</span>
        )}
      </td>
      <td
        className={tdClass('w-24 text-right')}
        onClick={() => editing === null && startEdit('unitCostMaterial')}
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
          <span className="font-mono text-[12px] tabular-nums">
            {fmtMoney(item.unitCostMaterial)}
          </span>
        )}
      </td>
      <td
        className={tdClass('w-24 text-right')}
        onClick={() => editing === null && startEdit('unitCostLabor')}
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
          <span className="font-mono text-[12px] tabular-nums">
            {fmtMoney(item.unitCostLabor)}
          </span>
        )}
      </td>
      <td
        className={tdClass('w-20 text-right')}
        onClick={() => editing === null && startEdit('markupPercent')}
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
          <span className="font-mono text-[11px] tabular-nums text-dim">
            {fmtPct(item.markupPercent)}
          </span>
        )}
      </td>
      <td className={tdClass('w-24 text-right')}>
        <span className="font-mono text-[12px] tabular-nums text-dim">
          {fmtMoney(item.lineCost)}
        </span>
      </td>
      <td className={tdClass('w-28 text-right')}>
        <span className="font-mono text-[12px] tabular-nums text-ink">
          {fmtMoney(item.lineSellPrice)}
        </span>
      </td>
      <td className="w-12 px-2 py-1 align-middle text-right">
        {!readOnly ? (
          <button
            type="button"
            aria-label="Delete line"
            onClick={onDelete}
            className="opacity-0 group-hover:opacity-100 font-mono text-[10px] uppercase tracking-label text-dim hover:text-mark-red"
          >
            ×
          </button>
        ) : null}
      </td>
    </tr>
  );
}

function labelStatus(s: string): string {
  switch (s) {
    case 'NEEDS_REVIEW':
      return 'Review';
    case 'NO_PRICE':
      return 'No price';
    case 'PENDING_SUB_QUOTE':
      return 'Sub';
    case 'AI_GENERATED':
      return 'AI';
    default:
      return s.charAt(0) + s.slice(1).toLowerCase();
  }
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
