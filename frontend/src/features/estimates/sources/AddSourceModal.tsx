import { useEffect, useState } from 'react';
import type { AxiosError } from 'axios';
import { backendErrorMessage } from '@/features/auth/useAuth';
import { useCreateSource, type SourceType } from './useSources';

const TABS: { id: SourceType; label: string; placeholder: string }[] = [
  {
    id: 'TRANSCRIPT',
    label: 'Transcript',
    placeholder: 'Paste a meeting transcript or call notes here',
  },
  { id: 'EMAIL', label: 'Email', placeholder: 'Paste the email body here' },
  {
    id: 'SCOPE_NOTES',
    label: 'Scope notes',
    placeholder: 'Paste rough scope notes or markup',
  },
];

interface AddSourceModalProps {
  open: boolean;
  onClose: () => void;
  estimateId: string;
}

export function AddSourceModal({ open, onClose, estimateId }: AddSourceModalProps) {
  const create = useCreateSource(estimateId);
  const [tab, setTab] = useState<SourceType>('TRANSCRIPT');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  useEffect(() => {
    if (!open) {
      setTab('TRANSCRIPT');
      setTitle('');
      setContent('');
      create.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const banner = create.error
    ? mapError(create.error as AxiosError)
    : title.trim() === '' && content.trim() !== ''
      ? 'Add a title before saving.'
      : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();
    if (trimmedTitle.length === 0 || trimmedContent.length === 0) return;
    try {
      await create.mutateAsync({
        type: tab,
        title: trimmedTitle,
        content: trimmedContent,
      });
      onClose();
    } catch {
      // banner picks up create.error
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-source-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[640px] border border-ink bg-paper-elevated p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-baseline justify-between border-b border-rule pb-3">
          <h2
            id="add-source-title"
            className="font-mono text-[12px] uppercase tracking-title text-ink"
          >
            Add source
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="font-mono text-[10px] uppercase tracking-label text-dim hover:text-ink"
          >
            Close
          </button>
        </div>

        <nav role="tablist" className="mb-4 grid grid-cols-3 border border-rule">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`border-r border-rule px-3 py-2 font-mono text-[10px] uppercase tracking-label last:border-r-0 ${
                tab === t.id ? 'bg-ink text-ink-inverse' : 'text-dim hover:text-ink'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <form onSubmit={submit} className="flex flex-col gap-4">
          {banner ? (
            <div
              role="alert"
              className="border border-mark-red/60 px-3 py-2 font-mono text-[10px] uppercase tracking-label text-mark-red"
            >
              {banner}
            </div>
          ) : null}

          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-label text-dim">
              Title
            </span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Site walkthrough — May 1"
              className="border-b border-rule bg-transparent py-2 font-sans text-[14px] outline-none focus:border-ink"
              maxLength={200}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-label text-dim">
              {TABS.find((t) => t.id === tab)?.label}
            </span>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={10}
              placeholder={TABS.find((t) => t.id === tab)?.placeholder}
              className="border border-rule bg-paper p-3 font-sans text-[13px] leading-snug outline-none focus:border-ink"
              maxLength={200 * 1024}
            />
            <span className="font-mono text-[10px] uppercase tracking-label text-dim">
              {contentLength(content)} / 200 KB
            </span>
          </label>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="border border-rule px-3 py-1 font-mono text-[10px] uppercase tracking-label text-ink hover:border-ink"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                create.isPending || title.trim().length === 0 || content.trim().length === 0
              }
              className="border border-ink bg-ink px-4 py-2 font-mono text-[11px] uppercase tracking-label text-ink-inverse transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {create.isPending ? 'Saving…' : 'Add source'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function contentLength(s: string): string {
  const bytes = new Blob([s]).size;
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function mapError(err: AxiosError): string {
  return backendErrorMessage(err, 'Could not add source.');
}
