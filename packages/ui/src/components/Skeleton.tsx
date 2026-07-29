import React from "react";
import { cn } from "../lib/utils";

export type SkeletonProps = React.HTMLAttributes<HTMLDivElement>;

export const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("animate-pulse rounded-md bg-border-subtle", className)}
        {...props}
      />
    );
  },
);

Skeleton.displayName = "Skeleton";

export interface AsyncValueProps extends React.HTMLAttributes<HTMLSpanElement> {
  loading?: boolean;
  /** Width reserved for the skeleton while it loads (defaults to three digits). */
  width?: React.CSSProperties["width"];
}

/**
 * Inline loading placeholder for counts and other short values. While loading a
 * fixed-width skeleton stands in for the value; once loaded the value flows at
 * its natural width so it sits flush against the surrounding copy (no trailing
 * gap from an over-reserved width).
 */
export function AsyncValue({
  loading = false,
  width = "3ch",
  children,
  className,
  style,
  ...props
}: AsyncValueProps) {
  return (
    <span
      aria-busy={loading || undefined}
      aria-hidden={loading || undefined}
      className={cn(
        loading &&
          "inline-block h-[1em] animate-pulse rounded-md bg-border-subtle align-[-0.125em]",
        className,
      )}
      style={loading ? { width, minWidth: width, ...style } : style}
      {...props}
    >
      {loading ? null : children}
    </span>
  );
}

// Common skeleton patterns
export const SkeletonText = ({ lines = 3 }: { lines?: number }) => (
  <div className="space-y-2">
    {Array.from({ length: lines }).map((_, i) => (
      <Skeleton key={i} className={cn("h-4", i === lines - 1 && "w-3/4")} />
    ))}
  </div>
);

export const SkeletonCard = () => (
  <div className="space-y-4">
    <Skeleton className="aspect-square w-full" />
    <div className="space-y-2">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  </div>
);

export const SkeletonAvatar = ({
  size = "md",
}: {
  size?: "sm" | "md" | "lg";
}) => {
  const sizes = {
    sm: "h-8 w-8",
    md: "h-10 w-10",
    lg: "h-12 w-12",
  };
  return <Skeleton className={cn("rounded-full", sizes[size])} />;
};
