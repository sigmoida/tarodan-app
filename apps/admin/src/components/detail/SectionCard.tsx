import { type ComponentType, type ReactNode } from 'react';
import { Card, cn } from '@tarodan/ui';

/**
 * The card wrapper every detail section uses — built on the design-system `Card`
 * (bordered) + a title/icon/actions header row. Replaces the legacy hand-rolled
 * `bg-surface-elevated rounded-xl p-6 shadow-sm` block and `.admin-card`.
 */
export function SectionCard({
  title,
  icon: Icon,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  /** Right-aligned controls in the header. */
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <Card variant="bordered" className={cn('p-6 shadow-sm', className)}>
      {(title || actions) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && (
            <h2 className="flex items-center gap-2 text-lg font-semibold text-heading">
              {Icon && <Icon className="h-5 w-5" />}
              {title}
            </h2>
          )}
          {actions}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </Card>
  );
}
