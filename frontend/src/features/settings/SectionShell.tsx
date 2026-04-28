import type { ReactNode } from 'react';

/**
 * Drafting-aesthetic wrapper for a settings section. Used by the per-section
 * components so they all share the same title-block + bordered card.
 */
export interface SectionShellProps {
  index: string; // "A", "B", …
  label: string; // "identity"
  children: ReactNode;
  saved?: boolean;
}

export function SectionShell({ index, label, children, saved }: SectionShellProps) {
  return (
    <section className="border border-rule bg-paper-elevated p-6">
      <header className="mb-6 flex items-baseline justify-between border-b border-rule-soft pb-3">
        <p className="font-mono text-[10px] uppercase tracking-label text-dim">
          {index} · {label}
        </p>
        {saved ? (
          <p className="font-mono text-[10px] uppercase tracking-label text-mark-green">
            Saved
          </p>
        ) : null}
      </header>
      {children}
    </section>
  );
}
