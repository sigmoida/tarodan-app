import { type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@tarodan/ui";

const TONE = {
  default: "bg-surface",
  muted: "bg-surface-alt",
} as const;

const PADDING = {
  sm: "p-3",
  md: "p-4",
} as const;

export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  tone?: keyof typeof TONE;
  padding?: keyof typeof PADDING;
  children: ReactNode;
}

/** İç kutu / alt kart — dış kart `SectionCard`, bunun içindeki kutular `Panel`. Gölge yok. */
export function Panel({
  tone = "default",
  padding = "md",
  className,
  children,
  ...props
}: PanelProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border",
        TONE[tone],
        PADDING[padding],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
