import type { EstimateDetail } from '@/features/estimates/types';

/**
 * Phase 2.10 placeholder — real Sources management lands in 2.13.
 */
export function SourcesPanel({ estimate }: { estimate: EstimateDetail }) {
  return (
    <section className="flex h-full flex-col border border-rule bg-paper-elevated">
      <header className="border-b border-rule-soft px-4 py-3">
        <p className="font-mono text-[10px] uppercase tracking-label text-dim">A · Sources</p>
        <p className="mt-1 font-sans text-[12px] text-dim">
          Transcripts, emails, scope notes
        </p>
      </header>
      <div className="flex-1 overflow-auto p-4">
        {estimate.sourceInputs.length === 0 ? (
          <div className="border border-dashed border-rule p-6 text-center">
            <p className="font-mono text-[10px] uppercase tracking-label text-dim">
              No sources yet
            </p>
            <p className="mt-2 font-sans text-[12px] text-dim">
              Source intake (transcripts / emails / notes) ships in Phase 2.13.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {estimate.sourceInputs.map((s) => (
              <li
                key={s.id}
                className="border border-rule-soft bg-paper p-3 font-sans text-[12px]"
              >
                <p className="font-mono text-[10px] uppercase tracking-label text-dim">
                  {s.type}
                </p>
                <p className="mt-1 text-ink">{s.title}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
