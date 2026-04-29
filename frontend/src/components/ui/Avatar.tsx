/**
 * Avatar (Phase 8.1).
 *
 * Photo if available, otherwise a colored circle with the user's
 * initials. The background color is derived deterministically from
 * the user's name so the same person always gets the same color.
 */

export type AvatarSize = 'sm' | 'md' | 'lg';

export interface AvatarProps {
  /** Display name — used for initials and to derive a stable hue. */
  name: string;
  /** Optional photo URL. When provided, renders an <img>. */
  src?: string | null;
  size?: AvatarSize;
  className?: string;
}

const SIZE_CLASSES: Record<AvatarSize, string> = {
  sm: 'h-6 w-6 text-[10px]',
  md: 'h-8 w-8 text-[12px]',
  lg: 'h-10 w-10 text-[14px]',
};

// 8 evenly-spaced HSL hues, all at the same lightness/saturation so
// the palette feels coherent. Saturation kept low for the readable
// text-on-color contrast.
const HUES = [210, 250, 330, 0, 30, 80, 160, 190];

function initialsOf(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) return '?';
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return ((parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? '')).toUpperCase();
}

function hashCode(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function Avatar({ name, src, size = 'md', className }: AvatarProps) {
  const initials = initialsOf(name);
  const hue = HUES[hashCode(name || '?') % HUES.length] ?? 210;
  const bg = `hsl(${hue}deg 60% 88%)`;
  const fg = `hsl(${hue}deg 50% 28%)`;
  return (
    <span
      data-testid="avatar"
      title={name}
      style={src ? undefined : { backgroundColor: bg, color: fg }}
      className={[
        'inline-flex flex-none items-center justify-center overflow-hidden rounded-full font-medium',
        SIZE_CLASSES[size],
        src ? 'bg-bg-tertiary' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {src ? (
        <img src={src} alt={name} className="h-full w-full object-cover" />
      ) : (
        <span aria-hidden="true">{initials}</span>
      )}
    </span>
  );
}
