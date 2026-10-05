import type { ReactNode } from "react";
import { SectionTitle } from "@/components/detail/SectionTitle";

/**
 * The header every dashboard zone opens with: an h2 title, an optional
 * one-line description under it and optional right-aligned actions (the period
 * filter). One recipe for all four zones.
 */
export function ZoneHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div>
      <SectionTitle as="h2" actions={actions}>
        {title}
      </SectionTitle>
      {description && <p className="text-xs text-muted">{description}</p>}
    </div>
  );
}
