import { useState } from 'react';
import { backendErrorMessage } from '@/features/auth/useAuth';
import { useCsvImport } from './usePricing';
import type { ImportResult } from './types';

type WizardStep = 'idle' | 'preview' | 'committing' | 'done';

interface CsvImportWizardProps {
  open: boolean;
  onClose: () => void;
  priceBookId: string;
}

export function CsvImportWizard({ open, onClose, priceBookId }: CsvImportWizardProps) {
  const importer = useCsvImport(priceBookId);
  const [step, setStep] = useState<WizardStep>('idle');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [committed, setCommitted] = useState<ImportResult | null>(null);

  if (!open) return null;

  const reset = () => {
    setStep('idle');
    setFile(null);
    setPreview(null);
    setCommitted(null);
    importer.reset();
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    setFile(f ?? null);
  };

  const runDryRun = async () => {
    if (!file) return;
    const result = await importer.mutateAsync({ file, dryRun: true });
    setPreview(result);
    setStep('preview');
  };

  const runCommit = async () => {
    if (!file) return;
    setStep('committing');
    const result = await importer.mutateAsync({ file, dryRun: false });
    setCommitted(result);
    setStep('done');
  };

  const banner = importer.error
    ? backendErrorMessage(importer.error, 'Could not import CSV.')
    : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="csv-wizard-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-[640px] border border-ink bg-paper-elevated p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-baseline justify-between border-b border-rule pb-3">
          <h2
            id="csv-wizard-title"
            className="font-mono text-[12px] uppercase tracking-title text-ink"
          >
            Import CSV {step !== 'idle' ? <span className="ml-3 text-dim">· {label(step)}</span> : null}
          </h2>
          <button
            type="button"
            onClick={handleClose}
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

        {step === 'idle' ? (
          <div className="flex flex-col gap-4">
            <p className="font-sans text-[13px] text-ink">
              Upload a CSV with columns:{' '}
              <span className="font-mono text-[11px] text-dim">
                category, code?, description, unit_of_measure, unit_cost_material, unit_cost_labor,
                default_markup_percent?, ai_keywords?
              </span>
              . Categories that don't yet exist will be created. Existing entries are matched by
              code first, then by (category + description).
            </p>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={onPickFile}
              className="font-mono text-[11px] text-ink file:mr-3 file:border file:border-ink file:bg-paper file:px-3 file:py-1 file:font-mono file:text-[10px] file:uppercase file:tracking-label file:text-ink hover:file:bg-ink hover:file:text-ink-inverse"
            />
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={handleClose}
                className="border border-rule px-3 py-1 font-mono text-[10px] uppercase tracking-label text-ink hover:border-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!file || importer.isPending}
                onClick={runDryRun}
                className="border border-ink bg-ink px-4 py-2 font-mono text-[11px] uppercase tracking-label text-ink-inverse transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {importer.isPending ? 'Reading…' : 'Preview'}
              </button>
            </div>
          </div>
        ) : null}

        {step === 'preview' && preview ? (
          <div className="flex flex-col gap-4">
            <SummaryGrid result={preview} />
            {preview.errors.length > 0 ? <ErrorTable errors={preview.errors} /> : null}
            <div className="flex justify-between">
              <button
                type="button"
                onClick={reset}
                className="border border-rule px-3 py-1 font-mono text-[10px] uppercase tracking-label text-ink hover:border-ink"
              >
                Pick another file
              </button>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleClose}
                  className="border border-rule px-3 py-1 font-mono text-[10px] uppercase tracking-label text-ink hover:border-ink"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={preview.errors.length > 0 || importer.isPending}
                  onClick={runCommit}
                  className="border border-ink bg-ink px-4 py-2 font-mono text-[11px] uppercase tracking-label text-ink-inverse transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Commit {preview.validRows} rows
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {step === 'committing' ? (
          <p className="font-mono text-[11px] uppercase tracking-label text-dim">
            Committing… please wait.
          </p>
        ) : null}

        {step === 'done' && committed ? (
          <div className="flex flex-col gap-4">
            <p className="font-mono text-[11px] uppercase tracking-label text-mark-green">
              Import committed
            </p>
            <SummaryGrid result={committed} />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleClose}
                className="border border-ink bg-ink px-4 py-2 font-mono text-[11px] uppercase tracking-label text-ink-inverse hover:bg-ink/90"
              >
                Done
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function label(step: WizardStep): string {
  switch (step) {
    case 'preview':
      return 'Review';
    case 'committing':
      return 'Committing';
    case 'done':
      return 'Done';
    default:
      return '';
  }
}

function SummaryGrid({ result }: { result: ImportResult }) {
  return (
    <dl className="grid grid-cols-3 gap-3 border border-rule bg-paper p-4 font-mono text-[11px] uppercase tracking-label text-dim">
      <Stat label="Total rows" value={result.totalRows} />
      <Stat label="Valid" value={result.validRows} />
      <Stat label="Errors" value={result.errorRows} tone={result.errorRows > 0 ? 'error' : undefined} />
      <Stat label="Categories +" value={result.categoriesToCreate.length} />
      <Stat label="Entries +" value={result.entriesToCreate} />
      <Stat label="Entries ↻" value={result.entriesToUpdate} />
    </dl>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'error';
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd
        className={`mt-1 font-mono text-[18px] tabular-nums ${
          tone === 'error' ? 'text-mark-red' : 'text-ink'
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function ErrorTable({ errors }: { errors: ImportResult['errors'] }) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-label text-mark-red">
        Per-row errors — fix and re-upload
      </p>
      <table className="mt-2 w-full border-collapse font-mono text-[11px]">
        <thead>
          <tr className="border-b border-rule-soft text-left text-dim">
            <th className="pr-3 font-normal">Row</th>
            <th className="pr-3 font-normal">Column</th>
            <th className="font-normal">Message</th>
          </tr>
        </thead>
        <tbody>
          {errors.slice(0, 30).map((e, i) => (
            <tr key={i} className="border-b border-rule-soft last:border-b-0">
              <td className="py-1 pr-3 tabular-nums">{e.row}</td>
              <td className="py-1 pr-3 text-dim">{e.column ?? '—'}</td>
              <td className="py-1 text-mark-red">{e.message}</td>
            </tr>
          ))}
          {errors.length > 30 ? (
            <tr>
              <td colSpan={3} className="py-1 text-dim">
                + {errors.length - 30} more
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
