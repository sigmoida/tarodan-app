import { type ReactNode } from "react";
import { cn } from "@tarodan/ui";

const SIZE = {
  md: "text-base font-semibold text-heading",
  sm: "text-sm font-semibold text-heading",
} as const;

/** Bölüm başlığı; `actions` aynı satırda sağa yaslanır. */
export function SectionTitle({
  children,
  as: Tag = "h3",
  size = "md",
  actions,
  className,
}: {
  children: ReactNode;
  as?: "h2" | "h3" | "h4";
  size?: keyof typeof SIZE;
  actions?: ReactNode;
  className?: string;
}) {
  const title = <Tag className={cn(SIZE[size], className)}>{children}</Tag>;
  if (!actions) return title;
  return (
    // flex-wrap: geniş eylemler (ör. tarih aralığı seçici) dar ekranda başlığın
    // altına iner, taşmaz.
    <div className="flex flex-wrap items-center justify-between gap-3">
      {title}
      <div className="flex flex-wrap items-center gap-2">{actions}</div>
    </div>
  );
}

/** Başlığın üstündeki küçük büyük-harf etiket. */
export function Eyebrow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "text-xs font-semibold uppercase tracking-wide text-muted",
        className,
      )}
    >
      {children}
    </p>
  );
}
