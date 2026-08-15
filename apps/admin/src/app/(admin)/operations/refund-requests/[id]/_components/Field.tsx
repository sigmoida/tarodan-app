import { type ReactNode } from "react";

/** Inline `label: value` row used in the refund detail cards. */
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-medium text-body">{label}:</span>
      <span>{children}</span>
    </div>
  );
}

/** Monospace-friendly `label: value` row for the technical details block. */
export function TechRow({
  label,
  value,
  mono,
}: {
  label: string;
  value?: string | null;
  mono?: boolean;
}) {
  return (
    <div className="flex gap-2">
      <span className="font-medium text-body">{label}:</span>
      <span className={mono ? "break-all font-mono text-muted" : "text-muted"}>
        {value || "—"}
      </span>
    </div>
  );
}
