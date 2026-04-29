/**
 * Drafting-aesthetic skeleton (Phase 8.2).
 *
 * Paper-toned placeholder lines that match the final layout's rhythm.
 * Used by data-fetching surfaces so first paint is structural rather
 * than blank.
 *
 * `Line` is the primitive — variable widths via the `width` prop. The
 * convenience `SkeletonList` and `SkeletonCard` cover the two common
 * shapes (a list of rows, a card with header + body).
 */

interface LineProps {
  /** CSS width — accepts any valid string ('60%', '120px', '8ch'). */
  width?: string;
  /** Tailwind height class. Default 'h-3' for body lines. */
  heightClass?: string;
  className?: string;
}

export function SkeletonLine({
  width = '100%',
  heightClass = 'h-3',
  className = '',
}: LineProps) {
  return (
    <div
      role="presentation"
      aria-hidden="true"
      data-testid="skeleton-line"
      style={{ width }}
      className={`animate-pulse bg-rule-soft ${heightClass} ${className}`}
    />
  );
}

interface SkeletonListProps {
  rows?: number;
  /** Render two columns per row (label + value) when true. */
  twoColumn?: boolean;
  className?: string;
}

export function SkeletonList({ rows = 4, twoColumn = false, className = '' }: SkeletonListProps) {
  return (
    <ul
      data-testid="skeleton-list"
      className={`flex flex-col ${className}`}
    >
      {Array.from({ length: rows }).map((_, i) => (
        <li
          key={i}
          className="flex items-center gap-3 border-b border-rule-soft px-4 py-3 last:border-b-0"
        >
          <SkeletonLine width={twoColumn ? '40%' : '70%'} />
          {twoColumn ? <SkeletonLine width="20%" heightClass="h-3" /> : null}
        </li>
      ))}
    </ul>
  );
}

interface SkeletonCardProps {
  rows?: number;
  className?: string;
}

export function SkeletonCard({ rows = 3, className = '' }: SkeletonCardProps) {
  return (
    <div
      data-testid="skeleton-card"
      className={`flex flex-col gap-3 border border-rule bg-paper-elevated p-4 ${className}`}
    >
      <SkeletonLine width="35%" heightClass="h-2" />
      <SkeletonLine width="80%" heightClass="h-4" />
      <div className="mt-2 flex flex-col gap-2">
        {Array.from({ length: rows }).map((_, i) => (
          <SkeletonLine
            key={i}
            width={i === rows - 1 ? '60%' : '100%'}
          />
        ))}
      </div>
    </div>
  );
}
