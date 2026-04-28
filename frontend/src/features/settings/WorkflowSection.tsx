import { useEffect, useState } from 'react';
import { backendErrorMessage } from '@/features/auth/useAuth';
import { SectionShell } from './SectionShell';
import { usePatchSettings } from './useOrganization';
import type { OrgSettings } from '@/features/auth/types';

export function WorkflowSection({ settings }: { settings: OrgSettings }) {
  const patch = usePatchSettings();
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (!savedAt) return;
    const t = window.setTimeout(() => setSavedAt(null), 2500);
    return () => window.clearTimeout(t);
  }, [savedAt]);

  const toggle = async () => {
    const next = !settings.drafterCanSend;
    try {
      await patch.mutateAsync({ drafterCanSend: next });
      setSavedAt(Date.now());
    } catch {
      // surfaced via patch.error banner
    }
  };

  const banner = patch.error ? backendErrorMessage(patch.error, 'Could not save.') : null;

  return (
    <SectionShell index="C" label="workflow" saved={Boolean(savedAt)}>
      {banner ? (
        <div
          role="alert"
          className="mb-4 border border-mark-red/60 px-3 py-2 font-mono text-[10px] uppercase tracking-label text-mark-red"
        >
          {banner}
        </div>
      ) : null}

      <div className="flex items-start justify-between gap-6">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-label text-ink">
            Drafters can send approved estimates
          </p>
          <p className="mt-2 max-w-[44ch] font-sans text-[12px] text-dim">
            When on, ESTIMATOR-role drafters can mark their own approved estimates as sent. When
            off, only OWNER and ADMIN can send.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={settings.drafterCanSend}
          onClick={toggle}
          disabled={patch.isPending}
          className={`mt-1 h-6 w-12 shrink-0 border border-ink transition ${
            settings.drafterCanSend ? 'bg-ink' : 'bg-paper'
          } disabled:cursor-not-allowed disabled:opacity-60`}
        >
          <span
            className={`block h-4 w-4 border border-ink transition-transform ${
              settings.drafterCanSend
                ? 'translate-x-6 bg-paper'
                : 'translate-x-0 bg-ink'
            }`}
          />
        </button>
      </div>
    </SectionShell>
  );
}
