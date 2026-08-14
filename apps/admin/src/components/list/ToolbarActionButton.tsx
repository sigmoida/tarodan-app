"use client";

import { type ReactNode } from "react";
import { Button, type ButtonProps } from "@tarodan/ui";
import { cn } from "@/lib/utils";

export interface ToolbarActionButtonProps extends Omit<
  ButtonProps,
  "children" | "aria-label" | "leftIcon"
> {
  /** Accessible name — stays the name in the icon-only state too. */
  label: string;
  icon: ReactNode;
  /** Optional trailing element (the active-filter count). */
  badge?: ReactNode;
}

/**
 * The toolbar's two actions (CSV export, filters) share one responsive shape:
 * on mobile they split the row as full-width icon + label buttons, from `sm` up
 * they collapse to a square icon button. `label` is the accessible name in both
 * states, so the icon-only form is never a screen-reader dead end.
 *
 * The icon is a plain child rather than the Button's `leftIcon` slot — that slot
 * hard-codes `mr-2`, which would push the icon off-centre once the label is gone.
 */
export function ToolbarActionButton({
  label,
  icon,
  badge,
  className,
  ...props
}: ToolbarActionButtonProps) {
  return (
    <Button
      variant="outline"
      aria-label={label}
      // Icon-only from `sm` up, so give the pointer a name too.
      title={label}
      className={cn("relative flex-1 sm:w-10 sm:flex-none sm:px-0", className)}
      {...props}
    >
      {icon}
      <span className="ml-2 sm:hidden">{label}</span>
      {badge}
    </Button>
  );
}
