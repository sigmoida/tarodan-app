import React from "react";
import { InboxIcon } from "@heroicons/react/24/outline";
import { cn } from "../lib/utils";

export interface EmptyStateProps {
  /** Optional icon override. Pass false to render without an icon. */
  icon?: React.ReactNode | false;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  /** Render style — 'default' has larger spacing, 'compact' for in-card use. */
  size?: "default" | "compact";
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className,
  size = "default",
}) => {
  const resolvedIcon =
    icon === false ? null : (icon ?? <InboxIcon className="h-7 w-7" />);

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        size === "default" ? "py-16 px-4" : "py-8 px-4",
        className,
      )}
    >
      {resolvedIcon && (
        <div
          className={cn(
            "mb-4 flex items-center justify-center rounded-full bg-surface-alt text-subtle",
            size === "default" ? "h-16 w-16" : "h-12 w-12",
          )}
        >
          {resolvedIcon}
        </div>
      )}
      <p className="mb-1 text-lg font-semibold text-heading">{title}</p>
      {description && (
        <p className="max-w-sm text-sm text-muted">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
};
