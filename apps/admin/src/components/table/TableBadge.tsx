import { type ReactNode } from "react";
import { Badge, type StatusConfig } from "@tarodan/ui";
import { type TableBadgeVariant } from "@/lib/status-tone";

/** The single badge size used inside tables. */
export const TABLE_BADGE_SIZE = "sm" as const;

export type TableBadgeProps = {
  /** Native tooltip — e.g. the full sentence behind a short badge label. */
  tooltip?: string;
} & (
  | {
      /** Plain mode: the state's colour + its label. */
      variant: TableBadgeVariant;
      children: ReactNode;
      status?: never;
      config?: never;
      label?: never;
    }
  | {
      /** Config mode: `status` looked up in `config` for label + variant. */
      status: string;
      config: Record<string, StatusConfig>;
      /** Overrides the config label (variant still comes from the config). */
      label?: ReactNode;
      variant?: never;
      children?: never;
    }
);

/**
 * The only badge a table cell renders. It is `@tarodan/ui` `Badge` with the
 * size locked to {@link TABLE_BADGE_SIZE} and no icon slot, so badges cannot
 * drift in size or pick up decoration from table to table. The colour comes
 * from the state (`variant`, or the status config) — see `STATUS_TONE`.
 *
 * A label longer than its column is clipped with `…` instead of spilling into
 * the next cell; the full text is then on the native tooltip.
 */
export function TableBadge(props: TableBadgeProps) {
  let variant: TableBadgeVariant;
  let content: ReactNode;
  if (props.status !== undefined) {
    const entry = props.config[props.status];
    variant = entry?.variant ?? "outline";
    content = props.label ?? entry?.label ?? props.status;
  } else {
    variant = props.variant;
    content = props.children;
  }
  const title =
    props.tooltip ?? (typeof content === "string" ? content : undefined);
  return (
    <Badge
      size={TABLE_BADGE_SIZE}
      variant={variant}
      title={title}
      className="max-w-full"
    >
      <span className="truncate">{content}</span>
    </Badge>
  );
}
