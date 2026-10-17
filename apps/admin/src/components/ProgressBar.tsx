import { cn } from "@tarodan/ui";

const TONE = {
  default: "bg-primary-600",
  success: "bg-success-600",
  warning: "bg-warning-500",
  danger: "bg-danger-600",
} as const;

/** Yatay ilerleme çubuğu; `value` 0–100 aralığına sıkıştırılır. */
export function ProgressBar({
  value,
  tone = "default",
  className,
  "aria-label": ariaLabel,
}: {
  value: number;
  tone?: keyof typeof TONE;
  className?: string;
  "aria-label"?: string;
}) {
  const pct = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-label={ariaLabel}
      className={cn(
        "h-2 w-full overflow-hidden rounded-full bg-surface-alt",
        className,
      )}
    >
      <div
        className={cn("h-full rounded-full transition-all", TONE[tone])}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
