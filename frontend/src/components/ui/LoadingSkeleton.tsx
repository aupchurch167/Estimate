/**
 * Loading skeletons (Phase 8.1).
 *
 * Animated bars sized to match the final content layout so first
 * paint is structural rather than blank. `Skeleton` is the primitive;
 * the convenience exports cover the common shapes (table rows, cards,
 * metric numbers).
 */

interface SkeletonProps {
  /** CSS width — any valid string ('60%', '120px', '8ch'). Default 100%. */
  width?: string;
  /** Tailwind height class — default h-3 (12px) for body lines. */
  heightClass?: string;
  className?: string;
  rounded?: 'sm' | 'md' | 'lg' | 'full';
}

export function Skeleton({
  width = '100%',
  heightClass = 'h-3',
  className = '',
  rounded = 'sm',
}: SkeletonProps) {
  return (
    <div
      role="presentation"
      aria-hidden="true"
      data-testid="skeleton"
      style={{ width }}
      className={[
        'animate-pulse bg-bg-tertiary',
        heightClass,
        `rounded-${rounded}`,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    />
  );
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={['flex flex-col gap-2', className ?? ''].filter(Boolean).join(' ')}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} width={i === lines - 1 ? '60%' : '100%'} />
      ))}
    </div>
  );
}

export function SkeletonRow({ columns = 4 }: { columns?: number }) {
  return (
    <tr data-testid="skeleton-row">
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="border-b border-border-primary px-4 py-3">
          <Skeleton width={i === 0 ? '70%' : '40%'} />
        </td>
      ))}
    </tr>
  );
}

export function SkeletonCard({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div
      data-testid="skeleton-card"
      className={[
        'flex flex-col gap-3 rounded-lg border border-border-primary bg-bg-primary p-5 shadow-sm',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <Skeleton width="35%" heightClass="h-2" />
      <Skeleton width="80%" heightClass="h-5" />
      <div className="mt-2 flex flex-col gap-2">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} width={i === rows - 1 ? '60%' : '100%'} />
        ))}
      </div>
    </div>
  );
}

export function SkeletonMetric({ className }: { className?: string }) {
  return (
    <div
      data-testid="skeleton-metric"
      className={['flex flex-col gap-2', className ?? ''].filter(Boolean).join(' ')}
    >
      <Skeleton width="40%" heightClass="h-3" />
      <Skeleton width="60%" heightClass="h-7" rounded="md" />
    </div>
  );
}
