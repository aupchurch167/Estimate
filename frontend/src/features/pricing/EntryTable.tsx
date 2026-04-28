import { useState } from 'react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import type { PriceBookCategory, PriceBookEntry } from './types';
import { useDeleteEntry } from './usePricing';

interface EntryTableProps {
  priceBookId: string;
  entries: PriceBookEntry[];
  categories: PriceBookCategory[];
  onEdit: (entry: PriceBookEntry) => void;
}

export function EntryTable({ priceBookId, entries, categories, onEdit }: EntryTableProps) {
  const del = useDeleteEntry(priceBookId);
  const [pendingDelete, setPendingDelete] = useState<PriceBookEntry | null>(null);

  const categoryName = (id: string) =>
    categories.find((c) => c.id === id)?.name ?? '—';

  if (entries.length === 0) {
    return (
      <p className="font-mono text-[10px] uppercase tracking-label text-dim">
        No entries match these filters.
      </p>
    );
  }

  return (
    <>
      <table className="w-full border-collapse font-sans text-[12px]">
        <thead>
          <tr className="border-b border-rule text-left">
            <Th>Code</Th>
            <Th>Description</Th>
            <Th>Category</Th>
            <Th className="text-center">UoM</Th>
            <Th className="text-right">Material</Th>
            <Th className="text-right">Labor</Th>
            <Th className="text-right">Markup</Th>
            <Th className="text-right">Used</Th>
            <Th className="text-right">Actions</Th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr
              key={e.id}
              className="border-b border-rule-soft last:border-b-0 hover:bg-paper"
            >
              <Td className="py-2 font-mono text-[11px] text-dim">{e.code ?? '—'}</Td>
              <Td className="py-2">{e.description}</Td>
              <Td className="py-2 font-mono text-[10px] uppercase tracking-label text-dim">
                {categoryName(e.categoryId)}
              </Td>
              <Td className="py-2 text-center font-mono text-[10px] uppercase tracking-label">
                {e.unitOfMeasure}
              </Td>
              <Td className="py-2 text-right font-mono tabular-nums">
                {fmt(e.unitCostMaterial)}
              </Td>
              <Td className="py-2 text-right font-mono tabular-nums">
                {fmt(e.unitCostLabor)}
              </Td>
              <Td className="py-2 text-right font-mono tabular-nums text-dim">
                {e.defaultMarkupPercent ? pct(e.defaultMarkupPercent) : '—'}
              </Td>
              <Td className="py-2 text-right font-mono tabular-nums text-dim">{e.usageCount}</Td>
              <Td className="py-2 text-right">
                <button
                  type="button"
                  onClick={() => onEdit(e)}
                  className="mr-2 border border-rule px-2 py-0.5 font-mono text-[10px] uppercase tracking-label text-ink hover:border-ink"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setPendingDelete(e)}
                  className="border border-rule px-2 py-0.5 font-mono text-[10px] uppercase tracking-label text-ink hover:border-mark-red hover:text-mark-red"
                >
                  Delete
                </button>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete entry?"
        body={
          pendingDelete ? (
            <p>
              <span className="font-mono text-[11px] text-ink">{pendingDelete.description}</span>{' '}
              will be soft-deleted. Estimates that already use it keep their snapshot pricing.
            </p>
          ) : null
        }
        confirmLabel="Delete"
        destructive
        onCancel={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (!pendingDelete) return;
          await del.mutateAsync(pendingDelete.id);
          setPendingDelete(null);
        }}
      />
    </>
  );
}

function Th({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`font-mono text-[10px] uppercase tracking-label text-dim font-normal pb-2 pr-3 ${className}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`pr-3 ${className}`}>{children}</td>;
}

function fmt(value: string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pct(value: string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return `${(n * 100).toFixed(0)}%`;
}
