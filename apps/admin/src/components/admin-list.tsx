"use client";

import { type ComponentType, type ReactNode } from "react";
import Link from "next/link";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { Input } from "@tarodan/ui";

/**
 * Admin liste sayfalarının "aksiyon alanları"nı tekilleştiren ortak component'ler:
 * PageHeader (başlık + ana aksiyon), FilterToolbar (arama + filtreler),
 * BulkActionBar (seçili-X + toplu aksiyon), ActionButtons/ActionIconButton (satır aksiyonları).
 */

export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold text-heading">{title}</h1>
        {description != null && <p className="mt-1 text-muted">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function FilterToolbar({
  search,
  onSearchChange,
  onSearchSubmit,
  searchPlaceholder = "Ara...",
  children,
}: {
  search: string;
  onSearchChange: (v: string) => void;
  onSearchSubmit?: () => void;
  searchPlaceholder?: string;
  /** Sağdaki filtre kontrolleri (Select'ler vb.). */
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <div className="relative flex-1">
        <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-subtle" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSearchSubmit?.();
          }}
          placeholder={searchPlaceholder}
          className="pl-10"
        />
      </div>
      {children}
    </div>
  );
}

export function BulkActionBar({
  count,
  children,
  onClear,
}: {
  count: number;
  children: ReactNode;
  onClear?: () => void;
}) {
  if (count <= 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-primary-200 bg-primary-50 px-4 py-2">
      <span className="text-sm font-medium text-body">{count} seçili</span>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          className="ml-auto text-sm text-muted hover:text-body"
        >
          Seçimi temizle
        </button>
      )}
    </div>
  );
}

type ActionVariant = "default" | "danger" | "success" | "primary";

const actionColor: Record<ActionVariant, string> = {
  default: "text-muted hover:bg-surface-alt",
  danger: "text-danger-600 hover:bg-danger-500/10",
  success: "text-success-700 hover:bg-success-500/10",
  primary: "text-primary-600 hover:bg-primary-500/10",
};

/** Satır aksiyonu için ikon butonu (Gör/Düzenle/Sil/Onayla...). href verilirse Link. */
export function ActionIconButton({
  icon: Icon,
  onClick,
  title,
  href,
  variant = "default",
  disabled,
}: {
  icon: ComponentType<{ className?: string }>;
  onClick?: () => void;
  title: string;
  href?: string;
  variant?: ActionVariant;
  disabled?: boolean;
}) {
  const cls = `inline-flex rounded-lg p-2 transition-colors ${actionColor[variant]} disabled:cursor-not-allowed disabled:opacity-50`;
  if (href) {
    return (
      <Link href={href} className={cls} title={title} aria-label={title}>
        <Icon className="h-5 w-5" />
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      disabled={disabled}
      className={cls}
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}

/** Satır aksiyon butonlarını gruplayan sarmalayıcı. */
export function ActionButtons({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-1">{children}</div>;
}
