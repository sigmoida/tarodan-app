import type {
  AdminOrderLine,
  AdminOrderListRow,
  AdminOrderPackage,
  AdminOrderParty,
} from "@tarodan/types";

/**
 * Saf görünüm türetmeleri — hücreler ve satır menüsü bunları okur, kural tek
 * yerde durur.
 */

/** Satırın dosya sayfası: sipariş dosyası (grup dosyası buradan çözülür). */
export function rowDetailHref(row: AdminOrderListRow): string {
  return `/operations/orders/${row.detailOrderId}`;
}

export function rowLines(row: AdminOrderListRow): AdminOrderLine[] {
  return row.packages.flatMap((pkg) => pkg.lines);
}

/**
 * Satır menüsünün sipariş işlemleri (durum güncelle, takip ekle) TEK sipariş
 * içindir; çok kalemli sepette hangi kalemin kastedildiği belirsizdir ve bu
 * işlemler sipariş dosyasında yapılır.
 */
export function rowSingleLine(row: AdminOrderListRow): AdminOrderLine | null {
  const lines = rowLines(row);
  return lines.length === 1 ? lines[0] : null;
}

/** Kesintinin ara toplama oranı (%, bir ondalık); ara toplam yoksa null. */
export function feeRate(amount: number, subtotal: number): number | null {
  if (!(subtotal > 0)) return null;
  return Math.round((amount / subtotal) * 1000) / 10;
}

/**
 * Paket blokları ürün, satıcı, birim fiyat, fatura ve kargo kolonlarında AYNI
 * hizada durmalı: her kolon bloğa bu yüksekliği verir — kalem başına sabit bir
 * satır yüksekliği (kalemsiz paket de bir satır yer tutar).
 */
export const PACKAGE_LINE_PX = 64;

export function packageBlockMinHeight(pkg: AdminOrderPackage): number {
  return Math.max(pkg.lines.length, 1) * PACKAGE_LINE_PX;
}

/** Satıcı kolonunun bir yuvası: kalemin satıcısı ve paket numarası. */
export interface SellerSlot {
  key: string;
  seller: AdminOrderParty;
  packageNumber: string | null;
}

/** Bir paketin kalemlerine düşen satıcı bilgisi (her kalemde aynı). */
export function packageSellerSlot(
  pkg: AdminOrderPackage,
): Omit<SellerSlot, "key"> {
  return { seller: pkg.seller, packageNumber: pkg.packageNumber };
}

/**
 * Satıcı kolonunun yuvaları, ürün kalemleriyle BİREBİR: her kaleme bir yuva
 * (aynı satıcının üç kalemi → üç yuva), böylece satıcı ve PKG kendi ürününün
 * hizasında durur. Paketi olmayan teklif satırında tek yuva teklifin
 * satıcısıdır (paket numarası yok).
 */
export function sellerSlots(
  row: Pick<AdminOrderListRow, "packages" | "offer">,
): SellerSlot[] {
  if (row.packages.length === 0) {
    return row.offer
      ? [{ key: row.offer.id, seller: row.offer.seller, packageNumber: null }]
      : [];
  }
  return row.packages.flatMap((pkg) =>
    pkg.lines.map((line) => ({ key: line.orderId, ...packageSellerSlot(pkg) })),
  );
}

/** Dışa aktarım: yuva başına "satıcı PKG", kalem sırasıyla. */
export function sellerSlotsExport(
  row: Pick<AdminOrderListRow, "packages" | "offer">,
): string {
  return sellerSlots(row)
    .map((slot) =>
      [slot.seller.displayName, slot.packageNumber].filter(Boolean).join(" "),
    )
    .join(" | ");
}

/**
 * Paketin faturalarını fatura listesinde açan bağlantı. Belgenin kayıt no'su
 * koli referansının gövdesini taşır (önek KYT-), liste araması `sourceReference`
 * içinde arar — gövdeyle aramak paketin bütün belgelerini getirir.
 */
export function invoiceSearchHref(packageNumber: string | null): string | null {
  if (!packageNumber) return null;
  const body = packageNumber.replace(/^[A-Z]+-/, "");
  return `/finance/invoices?q=${encodeURIComponent(body)}`;
}

/** Paket belgelerinin durum özeti (durum → adet), ilk görülme sırasıyla. */
export function invoiceStatusSummary(
  invoices: readonly { status: string }[],
): { status: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const invoice of invoices) {
    counts.set(invoice.status, (counts.get(invoice.status) ?? 0) + 1);
  }
  return [...counts.entries()].map(([status, count]) => ({ status, count }));
}

/** Paketteki kalemlerin farklı sipariş durumları (çoğunlukla tek). */
export function packageOrderStatuses(pkg: AdminOrderPackage): string[] {
  return [...new Set(pkg.lines.map((line) => line.status))];
}

/** Fiyat farkının tonu: ilanın altında pazarlık pozitif farktır. */
export function priceDiffTone(
  difference: number | null,
): "positive" | "negative" | "default" {
  if (difference == null || difference === 0) return "default";
  return difference > 0 ? "positive" : "negative";
}
