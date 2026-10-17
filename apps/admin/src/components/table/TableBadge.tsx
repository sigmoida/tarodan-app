"use client";

import { type ReactNode } from "react";
import { Badge, resolveBadge, type StatusConfig } from "@tarodan/ui";
import { type TableBadgeVariant } from "@/lib/status-tone";
import { TruncatedText } from "./TruncatedText";

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
 * The label is a `TruncatedText`: a label longer than its column is clipped
 * with `…` (never spills into the next cell) and only THEN reachable in full —
 * hover tooltip, tap / Enter popover — exactly like clipped cell text.
 */
export function TableBadge(props: TableBadgeProps) {
  // Badge's own lookup (plain / status config) — never re-implemented here.
  const { variant, content } = resolveBadge(props);
  const text = typeof content === "string" ? content : undefined;
  return (
    <Badge
      size={TABLE_BADGE_SIZE}
      variant={variant}
      // A deliberate tooltip (full sentence behind a short label) is always on.
      title={props.tooltip}
      className="min-w-0 max-w-full"
    >
      <TruncatedText className="min-w-0" fullText={props.tooltip ?? text}>
        {content}
      </TruncatedText>
    </Badge>
  );
}
