import { useMemo, useState } from 'react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui';
import type { EstimateDetail, LineItem } from '@/features/estimates/types';
import { GridRow } from './GridRow';
import { LineItemEditor } from './LineItemEditor';
import { SectionHeader } from './SectionHeader';
import {
  useBulkDeleteLineItems,
  useCreateLineItem,
  useCreateSection,
  useDeleteSection,
  useDuplicateLineItem,
  usePatchLineItem,
  usePatchSection,
  type LineItemStatus,
} from './useLineItems';

const FILTERS: { id: 'all' | LineItemStatus; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'NEEDS_REVIEW', label: 'Needs review' },
  { id: 'NO_PRICE', label: 'No price' },
  { id: 'ASSUMED', label: 'Assumed' },
];

const READ_ONLY_STATUSES = new Set(['SENT', 'WON', 'LOST']);
const COL_COUNT = 10;

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
  const patchSection = usePatchSection(estimate.id);
  const deleteSection = useDeleteSection(estimate.id);
  const createLineItem = useCreateLineItem(estimate.id);
  const patchLineItem = usePatchLineItem(estimate.id);
  const duplicateLineItem = useDuplicateLineItem(estimate.id);
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

  const isMod = (e: React.KeyboardEvent) =>
    navigator.platform?.startsWith('Mac') ? e.metaKey : e.ctrlKey;

  const onGridKeyDown = (e: React.KeyboardEvent<HTMLTableElement>) => {
    if (visibleIds.length === 0) return;
    const idx = focusedRowId ? visibleIds.indexOf(focusedRowId) : -1;

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const nextIdx =
        e.key === 'ArrowDown'
          ? Math.min(visibleIds.length - 1, idx + 1)
          : Math.max(0, idx - 1);
      const nextId = visibleIds[nextIdx];
      if (!nextId) return;

      if (e.shiftKey) {
        setSelected((prev) => {
          const next = new Set(prev);
          next.add(nextId);
          if (focusedRowId) next.add(focusedRowId);
          return next;
        });
      }

      setFocusedRowId(nextId);
      document.querySelector<HTMLTableRowElement>(`[data-testid="row-${nextId}"]`)?.focus();
      e.preventDefault();
      return;
    }

    if (isMod(e) && e.key.toLowerCase() === 'd' && !readOnly) {
      e.preventDefault();
      if (!focusedRowId) return;
      const item = estimate.lineItems.find((li) => li.id === focusedRowId);
      if (item) duplicateLineItem.mutate(item);
      return;
    }

    if (isMod(e) && e.key === 'Backspace' && !readOnly) {
      e.preventDefault();
      const toDelete = selected.size > 0 ? selected : focusedRowId ? new Set([focusedRowId]) : null;
      if (toDelete && toDelete.size > 0) {
        setPendingBulkDelete(true);
      }
      return;
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-border-primary pb-3">
        <div className="flex items-center gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${
                filter === f.id
                  ? 'bg-primary-light text-primary'
                  : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'
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
          className="ml-auto h-8 w-full max-w-[280px] rounded-md border border-border-secondary bg-bg-tertiary px-3 text-[13px] text-text-primary placeholder:text-text-tertiary focus-visible:border-border-focus focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
        />
        {!readOnly ? (
          <Button
            size="sm"
            onClick={() => createSection.mutate({ name: `Section ${sections.length + 1}` })}
          >
            + Section
          </Button>
        ) : null}
      </div>

      {selected.size > 0 && !readOnly ? (
        <div className="flex items-center justify-between border-b border-border-primary bg-bg-secondary px-3 py-2">
          <p className="text-[13px] font-medium text-text-primary">{selected.size} selected</p>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
            <Button size="sm" variant="danger" onClick={() => setPendingBulkDelete(true)}>
              Delete {selected.size}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex-1 overflow-auto">
        <table
          onKeyDown={onGridKeyDown}
          className="w-full border-collapse"
          aria-label="Line items"
        >
          <thead>
            <tr className="border-b border-border-primary bg-bg-secondary text-left">
              <Th className="w-8"> </Th>
              <Th className="w-[280px]">Description</Th>
              <Th className="w-20 text-right">Qty</Th>
              <Th className="w-20 text-center">UoM</Th>
              <Th className="w-20 text-right">Material</Th>
              <Th className="w-20 text-right">Labor</Th>
              <Th className="w-20 text-right">Markup</Th>
              <Th className="w-20 text-right">Cost</Th>
              <Th className="w-24 text-right">Sell</Th>
              <Th className="w-10"> </Th>
            </tr>
          </thead>
          <tbody>
            {sections.length === 0 ? (
              <tr>
                <td colSpan={COL_COUNT} className="p-8 text-center">
                  <p className="text-[14px] font-medium text-text-primary">No sections yet</p>
                  {!readOnly ? (
                    <p className="mt-1 text-[13px] text-text-secondary">
                      Click <span className="font-medium">+ Section</span> above to start.
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
                  onRenameSection={
                    readOnly
                      ? undefined
                      : (name) => patchSection.mutate({ id: section.id, patch: { name } })
                  }
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
                    onOpenEditor={() => setEditingItemId(item.id)}
                  />
                )),
              ];
              if (items.length === 0 && allSectionItems.length > 0) {
                rows.push(
                  <tr key={`hidden-${section.id}`}>
                    <td colSpan={COL_COUNT} className="px-3 py-2 text-center">
                      <p className="text-[12px] text-text-tertiary">
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
      className={`px-2 py-2 text-[12px] font-medium uppercase tracking-[0.06em] text-text-secondary ${className}`}
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
