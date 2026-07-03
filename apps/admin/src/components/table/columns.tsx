import { type ColumnDef } from '@tanstack/react-table';
import { type ReactNode } from 'react';
import { type CellColumnMeta } from './meta';
import {
  CellActions,
  CellBadge,
  CellCode,
  CellDate,
  CellLink,
  CellMoney,
  CellMuted,
  CellNumber,
  CellText,
  CellUser,
  type MoneyTone,
} from './cells';

/**
 * Tipli kolon factory. Ham `ColumnDef` yerine `col.text(...)`, `col.money(...)`
 * gibi üreticiler kullanılır; hizalama, truncate, format, genişlik ve boşluk
 * davranışı tipin içinde kilitlidir → tablolar arası tutarsızlık imkânsız.
 * Tek sorumluluk sayfada kalır: hangi alanı gösterdiğin.
 *
 *   const columns = [
 *     col.link('Sipariş', r => ({ href: `/orders/${r.id}`, label: `#${r.no}` })),
 *     col.user('Alıcı', r => ({ name: r.buyer.name, secondary: r.buyer.email })),
 *     col.money('Tutar', r => r.amount),
 *     col.date('Tarih', r => r.createdAt),
 *     col.badge('Durum', r => <StatusBadge status={r.status} />),
 *     col.actions(r => <RowMenu id={r.id} />),
 *   ];
 */

type Row<T> = { original: T };
export interface ColOpts extends CellColumnMeta {
  /** react-table kolon kimliği; başlık string değilse/boşsa gerekir. */
  id?: string;
}

// minWidth = kolonun taban px genişliği: hem yatay-scroll eşiğinin (Σ minWidth)
// payı, hem de geniş ekranda orantılı büyüme ağırlığı. `grow` artık genişliği
// ETKİLEMEZ (tabloyu `<table>` min-width + `table-fixed` yönetir); alanı geriye
// dönük uyumluluk için bırakıyoruz. Bir kolonu genişletmek/daraltmak için
// `minWidth` ver.
const DEFAULTS = {
  text: { grow: 3, minWidth: 160, align: 'left' },
  muted: { grow: 2, minWidth: 140, align: 'left' },
  money: { grow: 1, minWidth: 120, align: 'right' },
  number: { grow: 1, minWidth: 100, align: 'right' },
  date: { grow: 1, minWidth: 120, align: 'left' },
  code: { grow: 2, minWidth: 140, align: 'left' },
  link: { grow: 3, minWidth: 150, align: 'left' },
  user: { grow: 4, minWidth: 190, align: 'left' },
  badge: { grow: 1, minWidth: 160, align: 'left' },
  actions: { grow: 1, minWidth: 120, align: 'right' },
  custom: { grow: 2, minWidth: 160, align: 'left' },
} as const;

function base<T>(
  type: keyof typeof DEFAULTS,
  header: ReactNode,
  cell: (row: T) => ReactNode,
  opts: ColOpts = {},
): ColumnDef<T, unknown> {
  const d = DEFAULTS[type];
  const id = opts.id ?? (typeof header === 'string' && header ? header : type);
  return {
    id,
    header: () => header,
    cell: ({ row }: { row: Row<T> }) => cell(row.original),
    meta: {
      align: opts.align ?? d.align,
      minWidth: opts.minWidth ?? d.minWidth,
      grow: opts.grow ?? d.grow,
    },
  };
}

export const col = {
  /** Serbest metin (truncate + hover). */
  text<T>(header: ReactNode, get: (r: T) => ReactNode, opts?: ColOpts) {
    return base<T>('text', header, (r) => <CellText value={get(r)} />, opts);
  },
  /** İkincil/soluk metin. */
  muted<T>(header: ReactNode, get: (r: T) => ReactNode, opts?: ColOpts) {
    return base<T>('muted', header, (r) => <CellMuted value={get(r)} />, opts);
  },
  /** Para (₺, sağa, tabular-nums). `tone` yalnız rengi değiştirir. */
  money<T>(
    header: ReactNode,
    get: (r: T) => number | string | null | undefined,
    opts?: ColOpts & { tone?: MoneyTone },
  ) {
    return base<T>('money', header, (r) => <CellMoney value={get(r)} tone={opts?.tone} />, opts);
  },
  /** Düz sayı (sağa, tabular-nums). */
  number<T>(header: ReactNode, get: (r: T) => number | string | null | undefined, opts?: ColOpts) {
    return base<T>('number', header, (r) => <CellNumber value={get(r)} />, opts);
  },
  /** Kısa tarih (hover'da tam zaman). */
  date<T>(header: ReactNode, get: (r: T) => string | number | Date | null | undefined, opts?: ColOpts) {
    return base<T>('date', header, (r) => <CellDate value={get(r)} />, opts);
  },
  /** ID / takip no (mono, kesilir). */
  code<T>(header: ReactNode, get: (r: T) => ReactNode, opts?: ColOpts) {
    return base<T>('code', header, (r) => <CellCode value={get(r)} />, opts);
  },
  /** Metin link'i. `null` dönerse boş placeholder. */
  link<T>(
    header: ReactNode,
    get: (r: T) => { href?: string | null; label?: ReactNode } | null | undefined,
    opts?: ColOpts,
  ) {
    return base<T>('link', header, (r) => {
      const v = get(r);
      return <CellLink href={v?.href} label={v?.label} />;
    }, opts);
  },
  /** Kişi/varlık (ad + opsiyonel alt satır). */
  user<T>(
    header: ReactNode,
    get: (r: T) => { name?: ReactNode; secondary?: ReactNode; href?: string | null } | null | undefined,
    opts?: ColOpts,
  ) {
    return base<T>('user', header, (r) => {
      const v = get(r);
      return <CellUser name={v?.name} secondary={v?.secondary} href={v?.href} />;
    }, opts);
  },
  /** Badge/rozet (wrap yok). `render` badge JSX'ini döndürür. */
  badge<T>(header: ReactNode, render: (r: T) => ReactNode, opts?: ColOpts) {
    return base<T>('badge', header, (r) => <CellBadge>{render(r)}</CellBadge>, opts);
  },
  /** Aksiyon alanı (sağa yaslı). Başlık varsayılan boş. */
  actions<T>(render: (r: T) => ReactNode, opts?: ColOpts & { header?: ReactNode }) {
    return base<T>('actions', opts?.header ?? '', (r) => <CellActions>{render(r)}</CellActions>, {
      id: 'actions',
      ...opts,
    });
  },
  /** Kaçış kapısı — serbest JSX ama yine hizalama/genişlik meta'sıyla. */
  custom<T>(header: ReactNode, render: (r: T) => ReactNode, opts?: ColOpts) {
    return base<T>('custom', header, render, opts);
  },
};
