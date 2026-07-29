import { type ReactNode } from "react";
import { Card, cn } from "@tarodan/ui";

/**
 * The card wrapper every detail section uses — built on the design-system `Card`
 * (bordered) + a title/actions header row. Card titles are intentionally
 * icon-free so every detail section reads the same. Replaces the legacy
 * hand-rolled `bg-surface-elevated rounded-xl p-6 shadow-sm` block and `.admin-card`.
 */
export function SectionCard({
  title,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  /** Right-aligned controls in the header. */
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <Card variant="bordered" className={cn("p-6 shadow-sm", className)}>
      {(title || actions) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && (
            <h2 className="text-lg font-semibold text-heading">{title}</h2>
          )}
          {actions}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </Card>
  );
}
