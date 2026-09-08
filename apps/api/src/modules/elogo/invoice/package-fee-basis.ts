import { LINE_DESCRIPTION } from "./invoice-line-description";
import type { InvoiceLineItem } from "./invoice-lines";
import {
  PACKAGE_FEE_COMPONENTS,
  PACKAGE_FEE_INVOICE_TYPES,
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
 *  - **Kalem**: belge TEK satırdır — hizmetin adı, 1 adet, paketin o hizmet için
 *    doğan toplam bedeli. Fatura adedi ürün adedi değildir; iki ürünlük bir koli
 *    de tek bir aracılık hizmeti almıştır.
 *
 * Satır tek olsa da **KDV sipariş bazında yuvarlanır** ve toplamı satıra açıkça
 * yazılır (`InvoiceLineItem.taxAmount`): checkout tahsil ederken tam olarak böyle
 * yuvarlıyor (`order-service-tax.helper.ts`). Birleşik matrah üzerinden yeniden
 * yuvarlamak beyanla tahsilat arasında kuruşluk fark bırakırdı.
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

/** Kalem başına verilmiş bedel indirimi (KDV hariç) — `Order.feeDiscountBreakdown`. */
export type PackageFeeDiscounts = Partial<
  Record<PackageFeeInvoiceType, number>
>;

export interface PackageFeeOrderRow {
  id: string;
  /** Kargo payları paketin YALNIZ bir siparişinde doludur (checkout kuralı). */
  buyerShippingAmount: number;
  sellerShippingAmount: number;
  /** Alıcıya geri verilmiş gidiş kargosu matrahı (iade bileşenlerinden). */
  refundedBuyerShippingAmount: number;
  /**
   * Bu siparişte hangi kaleme ne kadar indirim verildiği. Kesinti kolonları
   * indirim SONRASI tutarı taşıdığı için brüt bedel ancak buradan geri kurulur.
   */
  feeDiscounts: PackageFeeDiscounts;
  ledger: PackageFeeLedgerRow | null;
}

export interface PackageFeeDocument {
  type: PackageFeeInvoiceType;
  side: "buyer" | "seller";
  /** İade öncesi matrah — kısmi iade oranının paydası. */
  base: number;
  /** İade düşülmüş matrah — belgeye yazılan tutar. */
  net: number;
  /** Belgede gösterilen iskonto (KDV hariç); brüt bedel = `net + discount`. */
  discount: number;
  /** Belgenin kalemi — tek satır (matrah tamamı iade edilmişse boş). */
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

/**
 * `Order.feeDiscountBreakdown` snapshot'ından kalem başına indirim toplamı.
 *
 * Snapshot indirim motorunun `AppliedFeeDiscount[]` çıktısıdır; `target` değerleri
 * (DiscountTarget) altı belge tipiyle BİREBİR aynı isimdedir, bu yüzden eşleme
 * gerekmez. Bozuk/eksik satır sessizce elenir: indirim gösterilememesi belgenin
 * hiç kesilmemesinden yeğdir (matrah zaten doğru, iskonto yalnız sunumdur).
 */
export function readFeeDiscounts(raw: unknown): PackageFeeDiscounts {
  if (!Array.isArray(raw)) return {};
  const totals: PackageFeeDiscounts = {};
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const { target, amount } = entry as Record<string, unknown>;
    if (
      typeof target !== "string" ||
      !(PACKAGE_FEE_INVOICE_TYPES as readonly string[]).includes(target)
    ) {
      continue;
    }
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) continue;
    const key = target as PackageFeeInvoiceType;
    totals[key] = round2((totals[key] ?? 0) + value);
  }
  return totals;
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
      discount: order.feeDiscounts?.[spec.type] ?? 0,
      ...amountsFor(order, spec),
    }));
    const base = round2(all.reduce((sum, row) => sum + row.base, 0));
    // Bedeli hiç doğmamış hizmet için belge yoktur. Tamamı iade edilmiş kalem
    // ise LİSTEDE KALIR (net = 0): kesim onu zaten atlar, ama iade hattı kısmi
    // iade oranını hesaplamak için iade ÖNCESİ matrahı buradan okur.
    if (base <= 0) continue;
    const rows = all.filter((row) => row.net > 0);

    // Belge tek satırdır: kalem adı hizmetin kendisidir, miktar 1. KDV ise
    // sipariş sipariş yuvarlanıp toplanır ve satıra açıkça yazılır.
    const net = round2(rows.reduce((sum, row) => sum + row.net, 0));
    const taxAmount = round2(
      rows.reduce((sum, row) => sum + round2((row.net * rate) / 100), 0),
    );
    // İskonto matrahla AYNI oranda küçülür: kısmi iadede indirimin de iade
    // edilen kısmı gösterilmemeli, yoksa brüt bedel tahsil edilenden büyük
    // görünür. Matrahı sıfırlanmış kalem iskonto da göstermez.
    const discount = round2(
      rows.reduce(
        (sum, row) =>
          sum + (row.base > 0 ? (row.discount * row.net) / row.base : 0),
        0,
      ),
    );
    const lines: InvoiceLineItem[] =
      rows.length > 0
        ? [
            {
              name: LINE_DESCRIPTION[spec.type],
              quantity: 1,
              net,
              ...(discount > 0 ? { discount } : {}),
              unitPrice: round2(net + discount),
              vatRate: rate,
              taxAmount,
            },
          ]
        : [];

    documents.push({
      type: spec.type,
      side: spec.side,
      base,
      net,
      discount: rows.length > 0 ? discount : 0,
      lines,
    });
  }

  return documents;
}
