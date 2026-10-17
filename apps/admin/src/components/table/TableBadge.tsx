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
 */
export function TableBadge(props: TableBadgeProps) {
  const { tooltip } = props;
  if (props.status !== undefined) {
    return (
      <Badge
        size={TABLE_BADGE_SIZE}
        status={props.status}
        config={props.config}
        label={props.label}
        title={tooltip}
      />
    );
  }
  return (
    <Badge size={TABLE_BADGE_SIZE} variant={props.variant} title={tooltip}>
      {props.children}
    </Badge>
  );
}
