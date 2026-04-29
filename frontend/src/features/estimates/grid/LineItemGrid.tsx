import { useMemo, useState } from 'react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import type { EstimateDetail, LineItem } from '@/features/estimates/types';
import { GridRow } from './GridRow';
import { LineItemEditor } from './LineItemEditor';
import { SectionHeader } from './SectionHeader';
import {
  useBulkDeleteLineItems,
  useCreateLineItem,
  useCreateSection,
  useDeleteLineItem,
  useDeleteSection,
  usePatchLineItem,
  type LineItemStatus,
} from './useLineItems';

const FILTERS: { id: 'all' | LineItemStatus; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'NEEDS_REVIEW', label: 'Needs review' },
  { id: 'NO_PRICE', label: 'No price' },
  { id: 'ASSUMED', label: 'Assumed' },
];

const READ_ONLY_STATUSES = new Set(['SENT', 'WON', 'LOST']);

interface LineItemGridProps {
  estimate: EstimateDetail;
}

export function LineItemGrid({ estimate }: LineItemGridProps) {
  const readOnly = READ_ONLY_STATUSES.has(estimate.status);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focusedRowId, setFocusedRowId] = useState<string | null>(null);
  const [pendingBulkDelete, setPendingBulkDelete] = useState(false);
  const [pendingSectionDelete, setPendingSectionDelete] = useState<string | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  const createSection = useCreateSection(estimate.id);
  const deleteSection = useDeleteSection(estimate.id);
  const createLineItem = useCreateLineItem(estimate.id);
  const patchLineItem = usePatchLineItem(estimate.id);
  const deleteLineItem = useDeleteLineItem(estimate.id);
  const bulkDelete = useBulkDeleteLineItems(estimate.id);

  const filtered = useMemo(() => filterItems(estimate.lineItems, filter, search), [
    estimate.lineItems,
    filter,
    search,
  ]);

  const sections = estimate.scopeSections;
  const visibleIds = filtered.map((li) => li.id);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onArrow = (e: React.KeyboardEvent<HTMLTableElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    if (visibleIds.length === 0) return;
    const idx = focusedRowId ? visibleIds.indexOf(focusedRowId) : -1;
    const nextIdx =
      e.key === 'ArrowDown'
        ? Math.min(visibleIds.length - 1, idx + 1)
        : Math.max(0, idx - 1);
    const nextId = visibleIds[nextIdx];
    if (nextId) {
      setFocusedRowId(nextId);
      const row = document.querySelector<HTMLTableRowElement>(`[data-testid="row-${nextId}"]`);
      row?.focus();
      e.preventDefault();
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-wrap items-center gap-3 border-b border-rule pb-3">
        <div className="flex items-center gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`border px-2 py-0.5 font-mono text-[10px] uppercase tracking-label transition ${
                filter === f.id
                  ? 'border-ink bg-ink text-ink-inverse'
                  : 'border-rule text-dim hover:border-ink hover:text-ink'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter rows by description"
          className="ml-auto w-full max-w-[280px] border-b border-rule bg-transparent py-1 font-sans text-[12px] outline-none focus:border-ink"
        />
        {!readOnly ? (
          <button
            type="button"
            onClick={() => createSection.mutate({ name: `Section ${sections.length + 1}` })}
            className="border border-ink px-3 py-1 font-mono text-[10px] uppercase tracking-label text-ink hover:bg-ink hover:text-ink-inverse"
          >
            + Section
          </button>
        ) : null}
      </div>

      {selected.size > 0 && !readOnly ? (
        <div className="flex items-center justify-between border-b border-rule-soft bg-paper px-3 py-2">
          <p className="font-mono text-[10px] uppercase tracking-label text-dim">
            {selected.size} selected
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="border border-rule px-2 py-0.5 font-mono text-[10px] uppercase tracking-label text-ink hover:border-ink"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => setPendingBulkDelete(true)}
              className="border border-mark-red bg-mark-red/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-label text-mark-red hover:bg-mark-red hover:text-ink-inverse"
            >
              Delete {selected.size}
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex-1 overflow-auto">
        <table
          onKeyDown={onArrow}
          className="w-full border-collapse table-fixed"
          aria-label="Line items"
        >
          <thead>
            <tr className="border-b border-rule text-left">
              <Th className="w-8"> </Th>
              <Th className="w-24">Status</Th>
              <Th>Description</Th>
              <Th className="w-20 text-right">Qty</Th>
              <Th className="w-20 text-center">UoM</Th>
              <Th className="w-24 text-right">Material $</Th>
              <Th className="w-24 text-right">Labor $</Th>
              <Th className="w-20 text-right">Markup</Th>
              <Th className="w-24 text-right">Cost</Th>
              <Th className="w-28 text-right">Sell</Th>
              <Th className="w-12"> </Th>
            </tr>
          </thead>
          <tbody>
            {sections.length === 0 ? (
              <tr>
                <td colSpan={11} className="p-6 text-center">
                  <p className="font-mono text-[10px] uppercase tracking-label text-dim">
                    No sections yet
                  </p>
                  {!readOnly ? (
                    <p className="mt-2 font-sans text-[12px] text-dim">
                      Click <span className="font-mono">+ Section</span> above to start.
                    </p>
                  ) : null}
                </td>
              </tr>
            ) : null}
            {sections.flatMap((section, i) => {
              const items = filtered.filter((li) => li.scopeSectionId === section.id);
              const allSectionItems = estimate.lineItems.filter(
                (li) => li.scopeSectionId === section.id,
              );
              const subtotal = allSectionItems.reduce(
                (acc, li) => acc + Number(li.lineSellPrice),
                0,
              );
              const rows: React.ReactNode[] = [
                <SectionHeader
                  key={`hdr-${section.id}`}
                  section={section}
                  index={i}
                  itemCount={allSectionItems.length}
                  subtotal={subtotal}
                  readOnly={readOnly}
                  onAddLineItem={() => createLineItem.mutate({ sectionId: section.id })}
                  onDeleteSection={() => setPendingSectionDelete(section.id)}
                />,
                ...items.map((item) => (
                  <GridRow
                    key={item.id}
                    item={item}
                    selected={selected.has(item.id)}
                    readOnly={readOnly}
                    focused={focusedRowId === item.id}
                    onFocus={() => setFocusedRowId(item.id)}
                    onToggleSelect={() => toggleSelect(item.id)}
                    onPatch={(patch) => patchLineItem.mutate({ id: item.id, patch })}
                    onDelete={() => deleteLineItem.mutate(item.id)}
                    onOpenEditor={() => setEditingItemId(item.id)}
                  />
                )),
              ];
              if (items.length === 0 && allSectionItems.length > 0) {
                rows.push(
                  <tr key={`hidden-${section.id}`}>
                    <td colSpan={11} className="px-3 py-2 text-center">
                      <p className="font-mono text-[10px] uppercase tracking-label text-dim">
                        {allSectionItems.length} hidden by filter
                      </p>
                    </td>
                  </tr>,
                );
              }
              return rows;
            })}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={pendingBulkDelete}
        title={`Delete ${selected.size} line item${selected.size === 1 ? '' : 's'}?`}
        body={
          <p>
            This is a soft delete; estimates that already use these lines keep their snapshot
            pricing. Continue?
          </p>
        }
        confirmLabel={`Delete ${selected.size}`}
        destructive
        onCancel={() => setPendingBulkDelete(false)}
        onConfirm={async () => {
          await bulkDelete.mutateAsync(Array.from(selected));
          setSelected(new Set());
          setPendingBulkDelete(false);
        }}
      />
      <ConfirmDialog
        open={Boolean(pendingSectionDelete)}
        title="Delete section?"
        body={
          <p>
            All line items inside this section will be soft-deleted along with it. Continue?
          </p>
        }
        confirmLabel="Delete section"
        destructive
        onCancel={() => setPendingSectionDelete(null)}
        onConfirm={async () => {
          if (!pendingSectionDelete) return;
          await deleteSection.mutateAsync(pendingSectionDelete);
          setPendingSectionDelete(null);
        }}
      />
      {editingItemId
        ? (() => {
            // Re-resolve from the latest list each render so the modal
            // shows fresh values when the query refetches mid-session.
            const item = estimate.lineItems.find((li) => li.id === editingItemId);
            if (!item) return null;
            return (
              <LineItemEditor
                key={item.id}
                estimate={estimate}
                item={item}
                onClose={() => setEditingItemId(null)}
              />
            );
          })()
        : null}
    </div>
  );
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`font-mono text-[10px] uppercase tracking-label text-dim font-normal pb-2 px-2 ${className}`}
    >
      {children}
    </th>
  );
}

function filterItems(
  items: LineItem[],
  filter: 'all' | LineItemStatus,
  search: string,
): LineItem[] {
  const q = search.trim().toLowerCase();
  return items.filter((li) => {
    if (filter !== 'all' && li.status !== filter) return false;
    if (q && !li.description.toLowerCase().includes(q)) return false;
    return true;
  });
}
