import { useState } from 'react';
import type { AxiosError } from 'axios';
import { backendErrorCode, backendErrorMessage } from '@/features/auth/useAuth';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import {
  useCreateCategory,
  useDeleteCategory,
  useUpdateCategory,
} from './usePricing';
import type { PriceBookCategory } from './types';

interface ManageCategoriesModalProps {
  open: boolean;
  onClose: () => void;
  priceBookId: string;
  categories: PriceBookCategory[];
}

export function ManageCategoriesModal({
  open,
  onClose,
  priceBookId,
  categories,
}: ManageCategoriesModalProps) {
  const create = useCreateCategory(priceBookId);
  const update = useUpdateCategory(priceBookId);
  const del = useDeleteCategory(priceBookId);
  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PriceBookCategory | null>(null);
  const [forcePrompt, setForcePrompt] = useState<{ id: string; entryCount: number } | null>(null);

  if (!open) return null;

  const onAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    await create.mutateAsync({ name: newName.trim() });
    setNewName('');
  };

  const onRenameSubmit = async (id: string) => {
    if (!renaming || renaming.id !== id) return;
    if (!renaming.value.trim()) return;
    await update.mutateAsync({ id, patch: { name: renaming.value.trim() } });
    setRenaming(null);
  };

  const onConfirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await del.mutateAsync({ id: pendingDelete.id });
      setPendingDelete(null);
    } catch (err) {
      const ax = err as AxiosError;
      const code = backendErrorCode(ax);
      if (
        code === 'category_has_entries' &&
        (ax.response?.data as { error?: { details?: { entryCount?: number } } })?.error?.details
          ?.entryCount !== undefined
      ) {
        const count =
          (ax.response?.data as { error: { details: { entryCount: number } } }).error.details
            .entryCount;
        setForcePrompt({ id: pendingDelete.id, entryCount: count });
        setPendingDelete(null);
      }
    }
  };

  const onConfirmForce = async () => {
    if (!forcePrompt) return;
    await del.mutateAsync({ id: forcePrompt.id, force: true });
    setForcePrompt(null);
  };

  const generalError =
    create.error ?? update.error ?? (del.error && backendErrorCode(del.error) !== 'category_has_entries' ? del.error : null);
  const banner = generalError
    ? backendErrorMessage(generalError, 'Could not save category change.')
    : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="manage-cats-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[520px] border border-ink bg-paper-elevated p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-baseline justify-between border-b border-rule pb-3">
          <h2
            id="manage-cats-title"
            className="font-mono text-[12px] uppercase tracking-title text-ink"
          >
            Manage categories
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="font-mono text-[10px] uppercase tracking-label text-dim hover:text-ink"
          >
            Close
          </button>
        </div>

        {banner ? (
          <div
            role="alert"
            className="mb-4 border border-mark-red/60 px-3 py-2 font-mono text-[10px] uppercase tracking-label text-mark-red"
          >
            {banner}
          </div>
        ) : null}

        <form onSubmit={onAdd} className="mb-6 flex items-end gap-3">
          <div className="flex flex-1 flex-col">
            <label
              htmlFor="new-category-name"
              className="font-mono text-[10px] uppercase tracking-label text-dim"
            >
              New category
            </label>
            <input
              id="new-category-name"
              className="w-full border-b border-rule bg-transparent py-2 font-sans text-[14px] text-ink outline-none focus:border-ink"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Roofing"
            />
          </div>
          <button
            type="submit"
            disabled={create.isPending || !newName.trim()}
            className="border border-ink bg-ink px-4 py-2 font-mono text-[11px] uppercase tracking-label text-ink-inverse transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Add
          </button>
        </form>

        <ul className="flex flex-col">
          {categories.length === 0 ? (
            <li className="py-2 font-mono text-[10px] uppercase tracking-label text-dim">
              No categories yet.
            </li>
          ) : null}
          {categories.map((c) => {
            const isRenaming = renaming?.id === c.id;
            return (
              <li
                key={c.id}
                className="flex items-center justify-between border-b border-rule-soft py-2"
              >
                {isRenaming ? (
                  <form
                    className="flex flex-1 items-center gap-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void onRenameSubmit(c.id);
                    }}
                  >
                    <input
                      autoFocus
                      className="flex-1 border-b border-rule bg-transparent py-1 font-sans text-[14px] outline-none focus:border-ink"
                      value={renaming!.value}
                      onChange={(e) => setRenaming({ id: c.id, value: e.target.value })}
                    />
                    <button
                      type="submit"
                      className="border border-ink px-2 py-0.5 font-mono text-[10px] uppercase tracking-label text-ink hover:bg-ink hover:text-ink-inverse"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setRenaming(null)}
                      className="font-mono text-[10px] uppercase tracking-label text-dim hover:text-ink"
                    >
                      Cancel
                    </button>
                  </form>
                ) : (
                  <>
                    <div>
                      <p className="font-sans text-[14px] text-ink">{c.name}</p>
                      <p className="font-mono text-[10px] uppercase tracking-label text-dim">
                        {c.entryCount} entries
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setRenaming({ id: c.id, value: c.name })}
                        className="border border-rule px-2 py-0.5 font-mono text-[10px] uppercase tracking-label text-ink hover:border-ink"
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingDelete(c)}
                        className="border border-rule px-2 py-0.5 font-mono text-[10px] uppercase tracking-label text-ink hover:border-mark-red hover:text-mark-red"
                      >
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete category?"
        body={
          pendingDelete ? (
            <p>
              <span className="font-mono text-[11px] text-ink">{pendingDelete.name}</span> will be
              soft-deleted. If it has active entries you'll be asked again before they are removed.
            </p>
          ) : null
        }
        confirmLabel="Delete"
        destructive
        onCancel={() => setPendingDelete(null)}
        onConfirm={onConfirmDelete}
      />

      <ConfirmDialog
        open={Boolean(forcePrompt)}
        title="Category has entries"
        body={
          forcePrompt ? (
            <p>
              This category has{' '}
              <span className="font-mono">{forcePrompt.entryCount}</span> active entries. Deleting
              the category will also soft-delete every one of them. Continue?
            </p>
          ) : null
        }
        confirmLabel="Delete category and entries"
        cancelLabel="Keep category"
        destructive
        onCancel={() => setForcePrompt(null)}
        onConfirm={onConfirmForce}
      />
    </div>
  );
}
