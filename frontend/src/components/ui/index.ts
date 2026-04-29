/**
 * UI primitives barrel (Phase 8.1).
 *
 * Import from `@/components/ui` rather than the individual files so we
 * have one rename-friendly entry point. Status map sits in
 * `@/constants/statusMap` since it's data, not a component.
 */

export { Button, type ButtonProps, type ButtonSize, type ButtonVariant } from './Button';
export { Input, type InputProps } from './Input';
export { Select, type SelectProps } from './Select';
export { Textarea, type TextareaProps } from './Textarea';
export { Modal, type ModalProps, type ModalSize } from './Modal';
export { Badge, type BadgeProps, type BadgeSize, type BadgeVariant } from './Badge';
export { Card, type CardProps } from './Card';
export { TitleBlock, type TitleBlockProps } from './TitleBlock';
export { Table } from './Table';
export { EmptyState, type EmptyStateProps } from './EmptyState';
export {
  Skeleton,
  SkeletonText,
  SkeletonRow,
  SkeletonCard,
  SkeletonMetric,
} from './LoadingSkeleton';
export { Avatar, type AvatarProps, type AvatarSize } from './Avatar';
export { ToastProvider, useToast, type ToastVariant } from './Toast';
