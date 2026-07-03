import { type ComponentType, type ReactNode } from 'react';
import { cn } from '@tarodan/ui';

/**
 * The card wrapper every detail section uses — replaces the repeated
 * `bg-surface-elevated rounded-xl p-6 shadow-sm` + `<h2>` + icon block (and the
 * legacy `.admin-card` class). Token-fed, no hardcoded colors.
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
    <section
      className={cn(
        'rounded-xl border border-border bg-surface-elevated p-6 shadow-sm',
        className,
      )}
    >
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
    </section>
  );
}
