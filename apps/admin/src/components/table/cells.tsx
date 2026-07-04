'use client';

import Link from 'next/link';
import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { fmtDate, fmtDateTime, fmtNumber, fmtTry } from '@/lib/format';
import { TruncatedText } from './TruncatedText';

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

/** Free text — single line, clipped, full text on hover when clipped. */
export function CellText({ value, className }: { value?: ReactNode; className?: string }) {
  if (value == null || value === '') return <Empty />;
  return <TruncatedText className={cn('text-body', className)}>{value}</TruncatedText>;
}

/** Secondary (muted) text — description, sub-info. */
export function CellMuted({ value }: { value?: ReactNode }) {
  if (value == null || value === '') return <Empty />;
  return <TruncatedText className="text-muted">{value}</TruncatedText>;
}

/** Money tone — only COLOR carries meaning; font/size/alignment/format always the same. */
export type MoneyTone = 'default' | 'positive' | 'negative' | 'primary';
const MONEY_TONE: Record<MoneyTone, string> = {
  default: 'text-body',
  positive: 'text-success-600',
  negative: 'text-danger-600',
  primary: 'text-primary-600',
};

/** Money — `tabular-nums`, no wrap (right-aligned via meta). */
export function CellMoney({
  value,
  tone = 'default',
}: {
  value?: number | string | null;
  tone?: MoneyTone;
}) {
  const text = fmtTry(value);
  if (text == null) return <Empty />;
  return (
    <span className={cn('whitespace-nowrap font-medium tabular-nums', MONEY_TONE[tone])}>{text}</span>
  );
}

/** Plain number — `tabular-nums`, no wrap. */
export function CellNumber({ value }: { value?: number | string | null }) {
  const text = fmtNumber(value);
  if (text == null) return <Empty />;
  return <span className="whitespace-nowrap tabular-nums text-body">{text}</span>;
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
  if (value == null || value === '') return <Empty />;
  return <TruncatedText className="font-mono text-body">{value}</TruncatedText>;
}

/** Text link — single standard link style, clipped. */
export function CellLink({ href, label }: { href?: string | null; label?: ReactNode }) {
  if (!href || label == null || label === '') return <Empty />;
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
  href,
}: {
  name?: ReactNode;
  secondary?: ReactNode;
  href?: string | null;
}) {
  if (name == null || name === '') return <Empty />;
  const nameNode = href ? (
    <Link href={href} className="block text-primary-600 hover:underline">
      <TruncatedText>{name}</TruncatedText>
    </Link>
  ) : (
    <TruncatedText className="text-body">{name}</TruncatedText>
  );
  return (
    <div className="min-w-0">
      {nameNode}
      {secondary != null && secondary !== '' && (
        <TruncatedText className="text-xs text-muted">{secondary}</TruncatedText>
      )}
    </div>
  );
}

/** Badge — never wraps, never shrinks. */
export function CellBadge({ children }: { children: ReactNode }) {
  return <div className="flex whitespace-nowrap">{children}</div>;
}

/** Action area — right-aligned, no wrap. Doesn't trigger the row click (DataTable closest check). */
export function CellActions({ children }: { children: ReactNode }) {
  return <div className="flex items-center justify-end gap-2 whitespace-nowrap">{children}</div>;
}
