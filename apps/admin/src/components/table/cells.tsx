"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import {
  CheckIcon,
  ClipboardIcon,
  CubeIcon,
} from "@heroicons/react/24/outline";
import { Avatar } from "@tarodan/ui";
import { cn } from "@/lib/utils";
import { fmtDate, fmtDateTime, fmtNumber, fmtTry } from "@/lib/format";
import { TruncatedText } from "./TruncatedText";

/**
 * Table cell primitives. Each type locks its own font, empty-value placeholder,
 * truncate and wrap behavior — alignment comes from the column meta (`td`), so
 * header and cell are always aligned the same way. Pages don't use these directly;
 * the `col.*` factory (columns.tsx) produces them.
 */

/** Uniform placeholder when there's no value. */
export function Empty() {
  return <span className="text-subtle">—</span>;
}

/**
 * Free text — single line, clipped, full text on hover when clipped.
 *
 * `wrap` bunun TEK istisnası: kırpmak yerine satır kaydırır. Uzun ve tam
 * okunması gereken alanlar için (ör. iade sebebi) açık tercih olarak verilir;
 * varsayılan kırpma, satır yüksekliklerinin tabloda sabit kalmasını sağlar.
 */
export function CellText({
  value,
  className,
  wrap,
}: {
  value?: ReactNode;
  className?: string;
  wrap?: boolean;
}) {
  if (value == null || value === "") return <Empty />;
  if (wrap) {
    return (
      <span
        className={cn(
          "block whitespace-normal break-words text-body",
          className,
        )}
      >
        {value}
      </span>
    );
  }
  return (
    <TruncatedText className={cn("text-body", className)}>
      {value}
    </TruncatedText>
  );
}

/** Secondary (muted) text — description, sub-info. */
export function CellMuted({ value }: { value?: ReactNode }) {
  if (value == null || value === "") return <Empty />;
  return <TruncatedText className="text-muted">{value}</TruncatedText>;
}

/** Money tone — only COLOR carries meaning; font/size/alignment/format always the same. */
export type MoneyTone = "default" | "positive" | "negative" | "primary";
const MONEY_TONE: Record<MoneyTone, string> = {
  default: "text-body",
  positive: "text-success-600",
  negative: "text-danger-600",
  primary: "text-primary-600",
};

/** Money — `tabular-nums`, no wrap (alignment via meta). */
export function CellMoney({
  value,
  tone = "default",
}: {
  value?: number | string | null;
  tone?: MoneyTone;
}) {
  const text = fmtTry(value);
  if (text == null) return <Empty />;
  return (
    <span
      className={cn(
        "whitespace-nowrap font-medium tabular-nums",
        MONEY_TONE[tone],
      )}
    >
      {text}
    </span>
  );
}

/** Plain number — `tabular-nums`, no wrap. */
export function CellNumber({ value }: { value?: number | string | null }) {
  const text = fmtNumber(value);
  if (text == null) return <Empty />;
  return (
    <span className="whitespace-nowrap tabular-nums text-body">{text}</span>
  );
}

/** Short date — no wrap; full date+time on hover. */
export function CellDate({ value }: { value?: string | number | Date | null }) {
  const text = fmtDate(value);
  if (text == null) return <Empty />;
  return (
    <span className="whitespace-nowrap text-body" title={fmtDateTime(value)}>
      {text}
    </span>
  );
}

/** Code like ID / tracking no — mono but the SAME size as other cells (text-sm), clipped. */
export function CellCode({ value }: { value?: ReactNode }) {
  if (value == null || value === "") return <Empty />;
  return <TruncatedText className="font-mono text-body">{value}</TruncatedText>;
}

/**
 * Opaque id (cuid) — shown compact (short mono form) with a copy button; the full
 * id is in the tooltip and copied on click. Keeps id columns narrow and readable
 * instead of spilling a 25-char cuid across the row.
 */
export function CellId({ value }: { value?: string | null }) {
  const [copied, setCopied] = useState(false);
  if (!value) return <Empty />;
  const short =
    value.length > 12 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
  return (
    <span className="inline-flex items-center gap-1">
      <span className="font-mono text-xs text-muted" title={value}>
        {short}
      </span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          navigator.clipboard?.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }}
        aria-label="Copy id"
        className="shrink-0 text-subtle transition-colors hover:text-body"
      >
        {copied ? (
          <CheckIcon className="h-3.5 w-3.5 text-success-600" />
        ) : (
          <ClipboardIcon className="h-3.5 w-3.5" />
        )}
      </button>
    </span>
  );
}

/** Text link — single standard link style, clipped. */
export function CellLink({
  href,
  label,
}: {
  href?: string | null;
  label?: ReactNode;
}) {
  if (!href || label == null || label === "") return <Empty />;
  return (
    <Link href={href} className="block text-primary-600 hover:underline">
      <TruncatedText>{label}</TruncatedText>
    </Link>
  );
}

/** Person/entity — name (+ optional sub-line: email etc.), each line clipped separately. */
export function CellUser({
  name,
  secondary,
  tertiary,
  avatar,
  href,
}: {
  name?: ReactNode;
  secondary?: ReactNode;
  tertiary?: ReactNode;
  avatar?: string | null;
  href?: string | null;
}) {
  if (name == null || name === "") return <Empty />;
  const label = typeof name === "string" ? name.trim() : "";
  const userId = href?.match(/^\/accounts\/users\/([^/?#]+)/)?.[1];
  const avatarSrc =
    userId && (!avatar || !/^(?:https?:\/\/|\/|blob:|data:)/i.test(avatar))
      ? `/gateway/users/${encodeURIComponent(userId)}/avatar`
      : avatar || undefined;
  const fallback =
    label
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("") || "?";
  const content = (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar
        src={avatarSrc}
        alt={label || undefined}
        fallback={fallback}
        size="sm"
      />
      <div className="min-w-0">
        <TruncatedText
          className={cn(
            "font-medium text-heading",
            href && "group-hover:text-primary-600",
          )}
        >
          {name}
        </TruncatedText>
        {secondary != null && secondary !== "" && (
          <TruncatedText className="text-xs text-muted">
            {secondary}
          </TruncatedText>
        )}
        {tertiary != null && tertiary !== "" && (
          <div className="mt-0.5 text-xs">{tertiary}</div>
        )}
      </div>
    </div>
  );
  return href ? (
    <Link href={href} className="group block min-w-0">
      {content}
    </Link>
  ) : (
    content
  );
}

/** Product — thumbnail, title and optional supporting lines in one consistent layout. */
export function CellProduct({
  title,
  secondary,
  tertiary,
  image,
  imageCount,
  href,
}: {
  title?: ReactNode;
  secondary?: ReactNode;
  tertiary?: ReactNode;
  image?: string | null;
  imageCount?: number | null;
  href?: string | null;
}) {
  if (title == null || title === "") return <Empty />;
  const label = typeof title === "string" ? title : "";
  const content = (
    <div className="flex min-w-0 items-center gap-3">
      <div className="relative h-10 w-10 shrink-0">
        <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-md bg-surface-alt text-muted">
          {image ? (
            <Image
              src={image}
              alt={label}
              fill
              sizes="40px"
              unoptimized
              className="object-cover"
            />
          ) : (
            <CubeIcon className="h-5 w-5" />
          )}
        </div>
        {imageCount != null && imageCount > 1 && (
          <span className="absolute -bottom-1 -right-1 rounded bg-heading/80 px-1 text-[10px] font-medium text-inverted">
            {imageCount}
          </span>
        )}
      </div>
      <div className="min-w-0">
        <TruncatedText
          className={cn(
            "font-medium text-heading",
            href && "group-hover:text-primary-600",
          )}
        >
          {title}
        </TruncatedText>
        {secondary != null && secondary !== "" && (
          <TruncatedText className="text-xs text-muted">
            {secondary}
          </TruncatedText>
        )}
        {tertiary != null && tertiary !== "" && (
          <div className="mt-0.5 text-xs text-muted">{tertiary}</div>
        )}
      </div>
    </div>
  );

  return href ? (
    <Link href={href} className="group block min-w-0">
      {content}
    </Link>
  ) : (
    content
  );
}

/** Badge — never wraps, never shrinks. */
export function CellBadge({ children }: { children: ReactNode }) {
  return <div className="flex whitespace-nowrap">{children}</div>;
}

/** Action area — right-aligned, no wrap. Doesn't trigger the row click (DataTable closest check). */
export function CellActions({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-end gap-2 whitespace-nowrap">
      {children}
    </div>
  );
}
