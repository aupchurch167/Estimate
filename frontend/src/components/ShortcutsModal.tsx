import { useShortcut } from '@/hooks/useShortcut';

const isMac =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || '');

const MOD = isMac ? '⌘' : 'Ctrl';

interface Group {
  title: string;
  rows: { combo: string[]; description: string }[];
}

const GROUPS: Group[] = [
  {
    title: 'Navigation',
    rows: [
      { combo: ['G', 'D'], description: 'Go to Dashboard' },
      { combo: ['G', 'E'], description: 'Go to Estimates' },
    ],
  },
  {
    title: 'General',
    rows: [
      { combo: ['?'], description: 'Open this shortcut sheet' },
      { combo: ['Esc'], description: 'Close any open modal' },
    ],
  },
  {
    title: 'Line item grid',
    rows: [
      { combo: ['Arrow keys'], description: 'Navigate between cells' },
      { combo: ['Enter'], description: 'Edit the focused cell' },
      { combo: ['Tab'], description: 'Commit edit + move right' },
      { combo: ['Shift', 'Tab'], description: 'Commit edit + move left' },
      { combo: [MOD, 'D'], description: 'Duplicate the focused row' },
      { combo: [MOD, '⌫'], description: 'Delete the focused / selected rows' },
      { combo: ['Shift', '↑/↓'], description: 'Multi-select rows' },
    ],
  },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ShortcutsModal({ open, onClose }: Props) {
  // Esc inside the modal — explicit because we want it to fire even when
  // the modal grabs focus.
  useShortcut('Escape', onClose, { allowInInput: true, disabled: !open });

  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-label="Keyboard shortcuts"
      data-testid="shortcuts-modal"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[560px] border border-ink bg-paper-elevated"
      >
        <header className="flex items-baseline justify-between border-b border-rule-soft px-5 py-3">
          <p className="font-mono text-[10px] uppercase tracking-label text-dim">
            Keyboard shortcuts
          </p>
          <button
            type="button"
            onClick={onClose}
            data-testid="shortcuts-close"
            className="font-mono text-[10px] uppercase tracking-label text-dim hover:text-ink"
          >
            Close (Esc)
          </button>
        </header>
        <div className="flex flex-col gap-4 p-5">
          {GROUPS.map((g) => (
            <section key={g.title} data-testid={`shortcuts-group-${g.title.toLowerCase().replace(/\s+/g, '-')}`}>
              <p className="font-mono text-[10px] uppercase tracking-label text-dim">
                {g.title}
              </p>
              <ul className="mt-2 flex flex-col">
                {g.rows.map((r, i) => (
                  <li
                    key={i}
                    className="flex items-baseline justify-between gap-2 border-b border-rule-soft py-2 last:border-b-0"
                  >
                    <span className="font-sans text-[13px] text-ink">{r.description}</span>
                    <span className="flex items-center gap-1">
                      {r.combo.map((k, j) => (
                        <kbd
                          key={j}
                          className="border border-rule bg-paper px-2 py-0.5 font-mono text-[11px] tabular-nums text-ink"
                        >
                          {k}
                        </kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
