import type {
  AdminOrderLine,
  AdminOrderListRow,
  AdminOrderPackage,
} from "@tarodan/types";

/**
 * Saf görünüm türetmeleri — hücreler ve satır menüsü bunları okur, kural tek
 * yerde durur.
 */

/** Satırın dosya sayfası: sipariş dosyası (grup buradan çözülür) ya da teklif. */
export function rowDetailHref(row: AdminOrderListRow): string {
  if (row.detailOrderId) return `/operations/orders/${row.detailOrderId}`;
  return `/operations/offers/${row.offer?.id ?? row.id}`;
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
 * Paket blokları ürün, birim fiyat, fatura ve kargo kolonlarında AYNI hizada
 * durmalı: her kolon bloğa bu yüksekliği verir. Satır başına sabit bir kalem
 * yüksekliği + paket başlığı.
 */
export const PACKAGE_HEADER_PX = 24;
export const PACKAGE_LINE_PX = 64;

export function packageBlockMinHeight(pkg: AdminOrderPackage): number {
  return PACKAGE_HEADER_PX + Math.max(pkg.lines.length, 1) * PACKAGE_LINE_PX;
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
