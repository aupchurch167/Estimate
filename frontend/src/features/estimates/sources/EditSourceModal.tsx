import { useEffect, useState } from 'react';
import type { AxiosError } from 'axios';
import { backendErrorCode, backendErrorMessage } from '@/features/auth/useAuth';
import type { SourceInput } from '@/features/estimates/types';
import { usePatchSource, useDeleteSource } from './useSources';

interface EditSourceModalProps {
  estimateId: string;
  source: SourceInput;
  /** When true, hides write affordances (estimate is SENT/WON/LOST). */
  readOnly?: boolean;
  onClose: () => void;
}

/**
 * Edit (or view, for file sources / read-only estimates) a source input.
 *
 * - Text-based sources: title + content fields editable.
 * - File-based sources (fileUrl set): read-only — modal shows the file
 *   metadata + a delete option only. Server will 409 with
 *   `file_source_not_editable` if the client somehow forces a save.
 *
 * Cmd/Ctrl-Enter saves; Escape closes.
 */
export function EditSourceModal({
  estimateId,
  source,
  readOnly = false,
  onClose,
}: EditSourceModalProps) {
  const isFile = Boolean(source.fileUrl);
  const editable = !readOnly && !isFile;

  const patch = usePatchSource(estimateId);
  const del = useDeleteSource(estimateId);

  const [title, setTitle] = useState(source.title);
  const [content, setContent] = useState(source.content ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setTitle(source.title);
    setContent(source.content ?? '');
    setConfirmDelete(false);
    patch.reset();
    del.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source.id]);

  const titleChanged = title.trim() !== source.title;
  const contentChanged = (content.trim() || null) !== (source.content?.trim() ?? null);
  const dirty = titleChanged || contentChanged;
  const canSave = editable && dirty && !patch.isPending && title.trim().length > 0 && content.trim().length > 0;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    patch.reset();
    const body: { title?: string; content?: string } = {};
    if (titleChanged) body.title = title.trim();
    if (contentChanged) body.content = content.trim();
    try {
      await patch.mutateAsync({ id: source.id, patch: body });
      onClose();
    } catch {
      // banner inline below
    }
  };

  // Esc closes; Cmd/Ctrl-Enter saves.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if (canSave) void onSubmit(new Event('submit') as unknown as React.FormEvent);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSave, title, content]);

  const onDelete = async () => {
    if (readOnly) return;
    try {
      await del.mutateAsync(source.id);
      onClose();
    } catch {
      // banner inline
    }
  };

  const errorMsg = mapError(patch.error as AxiosError | null);

  return (
    <div
      role="dialog"
      aria-label={isFile ? 'View source (file)' : 'Edit source'}
      data-testid="edit-source-modal"
      className="fixed inset-0 z-40 flex items-center justify-center bg-ink/40 px-4"
    >
      <form
        onSubmit={onSubmit}
        className="flex w-full max-w-[560px] max-h-[90vh] flex-col border border-ink bg-paper-elevated"
      >
        <header className="border-b border-rule-soft px-5 py-3">
          <p className="font-mono text-[10px] uppercase tracking-label text-dim">
            {isFile
              ? 'Source · file (read-only)'
              : readOnly
                ? 'Source · read-only'
                : 'Edit source'}
          </p>
          <p className="mt-1 font-sans text-[14px] text-ink">{labelType(source.type)}</p>
        </header>

        {readOnly ? (
          <div
            role="alert"
            className="border-b border-rule-soft bg-paper px-5 py-2 font-mono text-[10px] uppercase tracking-label text-mark-amber"
          >
            Sources can't be edited while the estimate is locked.
          </div>
        ) : null}
        {isFile ? (
          <div
            role="alert"
            className="border-b border-rule-soft bg-paper px-5 py-2 font-mono text-[10px] uppercase tracking-label text-dim"
          >
            Files cannot be edited — delete and re-upload to replace.
          </div>
        ) : null}

        <div className="flex-1 overflow-auto px-5 py-4 flex flex-col gap-3">
          <Field label="Title">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              disabled={!editable || patch.isPending}
              data-testid="edit-source-title"
              className={inputClass}
            />
          </Field>

          {isFile ? (
            <>
              <Field label="File URL">
                <a
                  href={source.fileUrl ?? '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all border border-rule bg-paper px-3 py-2 font-mono text-[11px] text-ink hover:border-ink"
                >
                  {source.fileUrl}
                </a>
              </Field>
              <p className="font-mono text-[10px] uppercase tracking-label text-dim">
                Uploaded {formatStamp(source.createdAt)}
              </p>
            </>
          ) : (
            <Field label="Content">
              <textarea
                rows={10}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                maxLength={200 * 1024}
                disabled={!editable || patch.isPending}
                data-testid="edit-source-content"
                className={`${inputClass} resize-vertical`}
              />
            </Field>
          )}

          {errorMsg ? (
            <p
              role="alert"
              className="font-mono text-[10px] uppercase tracking-label text-mark-red"
            >
              {errorMsg}
            </p>
          ) : null}
          {del.error ? (
            <p
              role="alert"
              className="font-mono text-[10px] uppercase tracking-label text-mark-red"
            >
              {backendErrorMessage(del.error as AxiosError, 'Could not delete the source.')}
            </p>
          ) : null}
        </div>

        <footer className="flex items-center justify-end gap-3 border-t border-rule-soft bg-paper px-5 py-3">
          {!readOnly ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              data-testid="edit-source-delete"
              className="mr-auto font-mono text-[10px] uppercase tracking-label text-dim hover:text-mark-red"
            >
              Delete source
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            data-testid="edit-source-cancel"
            className="font-mono text-[10px] uppercase tracking-label text-dim hover:text-ink"
          >
            {editable ? 'Cancel' : 'Close'}
          </button>
          {editable ? (
            <button
              type="submit"
              disabled={!canSave}
              data-testid="edit-source-save"
              className="border border-ink bg-ink px-4 py-2 font-mono text-[11px] uppercase tracking-label text-ink-inverse hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {patch.isPending ? 'Saving…' : 'Save'}
            </button>
          ) : null}
        </footer>
      </form>

      {confirmDelete ? (
        <div
          role="dialog"
          aria-label="Delete source confirm"
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 px-4"
        >
          <div className="w-full max-w-[420px] border border-ink bg-paper-elevated p-5">
            <p className="font-mono text-[10px] uppercase tracking-label text-dim">
              Delete source
            </p>
            <p className="mt-2 font-sans text-[14px] text-ink">
              Remove "{source.title}" from this estimate? This is a soft delete; past
              AI runs that referenced it stay unchanged.
            </p>
            <div className="mt-4 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="font-mono text-[10px] uppercase tracking-label text-dim hover:text-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onDelete}
                disabled={del.isPending}
                data-testid="edit-source-delete-confirm"
                className="border border-mark-red bg-mark-red/10 px-3 py-1 font-mono text-[10px] uppercase tracking-label text-mark-red hover:bg-mark-red hover:text-ink-inverse disabled:cursor-not-allowed disabled:opacity-50"
              >
                {del.isPending ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const inputClass =
  'w-full border border-rule bg-paper px-3 py-2 font-sans text-[13px] text-ink focus:border-ink focus:outline-none disabled:cursor-not-allowed disabled:opacity-60';

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-[10px] uppercase tracking-label text-dim">{label}</span>
      {children}
    </label>
  );
}

function mapError(err: AxiosError | null): string | null {
  if (!err) return null;
  const code = backendErrorCode(err);
  if (code === 'cannot_edit_in_current_status') {
    return 'This estimate is locked — refresh and reopen the source.';
  }
  if (code === 'file_source_not_editable') {
    return 'This source is a file. Delete and re-upload to replace.';
  }
  if (err.response?.status === 403) {
    return 'You do not have permission to edit this source.';
  }
  return backendErrorMessage(err, 'Could not save the source.');
}

function labelType(type: string): string {
  switch (type) {
    case 'TRANSCRIPT':
      return 'Transcript';
    case 'EMAIL':
      return 'Email';
    case 'SCOPE_NOTES':
      return 'Scope notes';
    case 'MANUAL_TEXT':
      return 'Notes';
    case 'PLAN_PDF':
      return 'Plan PDF';
    case 'COMPANYCAM_PROJECT':
      return 'CompanyCam';
    case 'REFERENCE_DOC':
      return 'Reference';
    default:
      return type;
  }
}

function formatStamp(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}
