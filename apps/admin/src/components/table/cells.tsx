'use client';

import Link from 'next/link';
import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { fmtDate, fmtDateTime, fmtNumber, fmtTry } from '@/lib/format';
import { TruncatedText } from './TruncatedText';

/**
 * Tablo hücre primitive'leri. Her tip; font, boşluk-değeri, truncate ve wrap
 * davranışını KENDİ içinde kilitler — hizalama kolon meta'sından (`td`) gelir,
 * böylece başlık ve hücre daima aynı hizada olur. Sayfalar bunları doğrudan
 * kullanmaz; `col.*` factory'si (columns.tsx) üretir.
 */

/** Değer yokken tek tip placeholder. */
export function Empty() {
  return <span className="text-subtle">—</span>;
}

/** Serbest metin — tek satır, kesilir, kesilince hover'da tam metin. */
export function CellText({ value, className }: { value?: ReactNode; className?: string }) {
  if (value == null || value === '') return <Empty />;
  return <TruncatedText className={cn('text-body', className)}>{value}</TruncatedText>;
}

/** İkincil (soluk) metin — açıklama, alt bilgi. */
export function CellMuted({ value }: { value?: ReactNode }) {
  if (value == null || value === '') return <Empty />;
  return <TruncatedText className="text-muted">{value}</TruncatedText>;
}

/** Para tonu — sadece RENK anlam taşır; font/boyut/hiza/format daima aynı. */
export type MoneyTone = 'default' | 'positive' | 'negative' | 'primary';
const MONEY_TONE: Record<MoneyTone, string> = {
  default: 'text-body',
  positive: 'text-success-600',
  negative: 'text-danger-600',
  primary: 'text-primary-600',
};

/** Para — `tabular-nums`, wrap yok (hizalama meta ile sağa). */
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

/** Düz sayı — `tabular-nums`, wrap yok. */
export function CellNumber({ value }: { value?: number | string | null }) {
  const text = fmtNumber(value);
  if (text == null) return <Empty />;
  return <span className="whitespace-nowrap tabular-nums text-body">{text}</span>;
}

/** Kısa tarih — wrap yok; hover'da tam tarih+saat. */
export function CellDate({ value }: { value?: string | number | Date | null }) {
  const text = fmtDate(value);
  if (text == null) return <Empty />;
  return (
    <span className="whitespace-nowrap text-body" title={fmtDateTime(value)}>
      {text}
    </span>
  );
}

/** ID / takip no gibi kod — mono ama diğer hücrelerle AYNI boyut (text-sm), kesilir. */
export function CellCode({ value }: { value?: ReactNode }) {
  if (value == null || value === '') return <Empty />;
  return <TruncatedText className="font-mono text-body">{value}</TruncatedText>;
}

/** Metin link'i — tek standart link stili, kesilir. */
export function CellLink({ href, label }: { href?: string | null; label?: ReactNode }) {
  if (!href || label == null || label === '') return <Empty />;
  return (
    <Link href={href} className="block text-primary-600 hover:underline">
      <TruncatedText>{label}</TruncatedText>
    </Link>
  );
}

/** Kişi/varlık — ad (+ opsiyonel alt satır: e-posta vb.), her satır ayrı kesilir. */
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

/** Badge/rozet — asla wrap etmez, daralmaz. */
export function CellBadge({ children }: { children: ReactNode }) {
  return <div className="flex whitespace-nowrap">{children}</div>;
}

/** Aksiyon alanı — sağa yaslı, wrap yok. Satır-tık'ı tetiklemez (DataTable closest kontrolü). */
export function CellActions({ children }: { children: ReactNode }) {
  return <div className="flex items-center justify-end gap-2 whitespace-nowrap">{children}</div>;
}
