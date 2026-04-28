import type { EstimateDetail } from '@/features/estimates/types';

/**
 * Phase 2.10 placeholder — real AI conversation lands in 3.3.
 */
export function ConversationPanel({ estimate }: { estimate: EstimateDetail }) {
  void estimate;
  return (
    <section className="flex h-full flex-col border border-rule bg-paper-elevated">
      <header className="border-b border-rule-soft px-4 py-3">
        <p className="font-mono text-[10px] uppercase tracking-label text-dim">
          B · Draft Session
        </p>
        <p className="mt-1 font-sans text-[12px] text-dim">
          Generate + refine line items with Quill
        </p>
      </header>
      <div className="flex-1 overflow-auto p-4">
        <div className="border border-dashed border-rule p-6 text-center">
          <p className="font-mono text-[10px] uppercase tracking-label text-dim">
            AI conversation
          </p>
          <p className="mt-2 font-sans text-[12px] text-dim">
            The chat interface and "Draft from sources" action ship in Phase 3.3.
          </p>
        </div>
      </div>
      <footer className="border-t border-rule-soft px-4 py-3">
        <p className="font-mono text-[10px] uppercase tracking-label text-dim">
          Type a follow-up… (3.3)
        </p>
      </footer>
    </section>
  );
}
