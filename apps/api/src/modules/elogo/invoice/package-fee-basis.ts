import { LINE_DESCRIPTION } from "./invoice-line-description";
import type { InvoiceLineItem } from "./invoice-lines";
import {
  PACKAGE_FEE_COMPONENTS,
  type PackageFeeComponentSpec,
  type PackageFeeInvoiceType,
} from "./package-fee-components";

/**
 * Bir satıcı paketinin kesinti kalemlerinden BELGE MATRAHLARINI üretir — saf
 * hesap, veritabanı erişimi yok (okuma `ElogoDocumentService`'te).
 *
 * Üç şeyi aynı anda çözer:
 *  - **Hangi belgeler kesilecek**: bedeli hiç doğmamış kalemler elenir.
 *  - **Ne kadarı kesilecek**: `base` iade ÖNCESİ matrah (kısmi iade oranının
 *    paydası), `net` iade DÜŞÜLMÜŞ matrah (belgeye yazılan). İkisini birlikte
 *    döndürmek zorunlu: iade faturası oranı orijinal matraha göre hesaplanır.
 *  - **Kalemler**: paketin her siparişi kendi satırını alır. KDV satır bazında
 *    yuvarlanır ve bu, checkout'un tahsil ederken yaptığı yuvarlamanın AYNISIDIR
 *    (`order-service-tax.helper.ts`); toplayıp sonra yuvarlamak beyanla tahsilat
 *    arasında kuruşluk fark bırakırdı.
 */

const round2 = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

const positive = (value: number | null | undefined): number =>
  Number.isFinite(value) && (value as number) > 0 ? (value as number) : 0;

/** Paketin bir siparişinin kesinti kırılımı — hepsi KDV HARİÇ matrah. */
export interface PackageFeeLedgerRow {
  componentBreakdownComplete: boolean;
  buyerCommissionAmount: number;
  buyerPlatformFeeAmount: number;
  sellerCommissionAmount: number;
  sellerPlatformFeeAmount: number;
  refundedBuyerCommissionAmount: number;
  refundedBuyerPlatformFeeAmount: number;
  refundedSellerCommissionAmount: number;
  refundedSellerPlatformFeeAmount: number;
}

export interface PackageFeeOrderRow {
  id: string;
  /** Fatura satırının adı çok siparişli pakette bu olur. */
  productName: string;
  /** Kargo payları paketin YALNIZ bir siparişinde doludur (checkout kuralı). */
  buyerShippingAmount: number;
  sellerShippingAmount: number;
  /** Alıcıya geri verilmiş gidiş kargosu matrahı (iade bileşenlerinden). */
  refundedBuyerShippingAmount: number;
  ledger: PackageFeeLedgerRow | null;
}

export interface PackageFeeDocument {
  type: PackageFeeInvoiceType;
  side: "buyer" | "seller";
  /** İade öncesi matrah — kısmi iade oranının paydası. */
  base: number;
  /** İade düşülmüş matrah — belgeye yazılan tutar. */
  net: number;
  /** Belgenin kalemleri; tek satırlıksa da doldurulur (KDV satır bazlı yuvarlanır). */
  lines: InvoiceLineItem[];
}

/**
 * Paketin tüm kesinti defterlerinde kalem kırılımı var mı? Yoksa kalem bazlı
 * belge kesilemez (tek elde yalnız birleşik toplam vardır) ve çağıran LEGACY
 * `commission` / `service_fee` belgelerine düşer.
 */
export function hasCompleteComponentBreakdown(
  orders: PackageFeeOrderRow[],
): boolean {
  return (
    orders.length > 0 &&
    orders.every((order) => order.ledger?.componentBreakdownComplete === true)
  );
}

function amountsFor(
  order: PackageFeeOrderRow,
  spec: PackageFeeComponentSpec,
): { base: number; net: number } {
  if (spec.source.kind === "shipping") {
    const base = positive(order[spec.source.amountField]);
    const refunded =
      spec.source.amountField === "buyerShippingAmount"
        ? positive(order.refundedBuyerShippingAmount)
        : 0;
    return { base, net: Math.max(0, round2(base - refunded)) };
  }
  const ledger = order.ledger;
  if (!ledger) return { base: 0, net: 0 };
  const base = positive(ledger[spec.source.amountField]);
  const refunded = positive(ledger[spec.source.refundedField]);
  return { base, net: Math.max(0, round2(base - refunded)) };
}

/**
 * @param orders   Paketin siparişleri (kesinti defterleriyle).
 * @param vatRate  Hizmet KDV oranı (%) — altı kalemin hepsi aynı orandadır.
 */
export function buildPackageFeeDocuments(
  orders: PackageFeeOrderRow[],
  vatRate: number,
): PackageFeeDocument[] {
  const rate = Number.isFinite(vatRate) && vatRate > 0 ? vatRate : 0;
  const documents: PackageFeeDocument[] = [];

  for (const spec of PACKAGE_FEE_COMPONENTS) {
    const all = orders.map((order) => ({
      order,
      ...amountsFor(order, spec),
    }));
    const base = round2(all.reduce((sum, row) => sum + row.base, 0));
    // Bedeli hiç doğmamış hizmet için belge yoktur. Tamamı iade edilmiş kalem
    // ise LİSTEDE KALIR (net = 0): kesim onu zaten atlar, ama iade hattı kısmi
    // iade oranını hesaplamak için iade ÖNCESİ matrahı buradan okur.
    if (base <= 0) continue;
    const rows = all.filter((row) => row.net > 0);

    // Tek satırlı belgede kalem adı hizmetin kendisidir; çok satırlıda hangi
    // ürünün hizmeti olduğu görünmeli — belge paket başınadır ama alıcı/satıcı
    // kalemin hangi üründen doğduğunu faturada görmek zorunda.
    const multiple = rows.length > 1;
    const lines: InvoiceLineItem[] = rows.map((row) => ({
      name: multiple
        ? row.order.productName.trim() || LINE_DESCRIPTION[spec.type]
        : LINE_DESCRIPTION[spec.type],
      quantity: 1,
      net: round2(row.net),
      unitPrice: round2(row.net),
      vatRate: rate,
    }));

    documents.push({
      type: spec.type,
      side: spec.side,
      base,
      net: round2(rows.reduce((sum, row) => sum + row.net, 0)),
      lines,
    });
  }

  return documents;
}
