/**
 * Faturanın KALEMLERİ.
 *
 * Platformun kendi hizmet faturaları (komisyon, üyelik, boost, takas) tek
 * kalemlidir — tek bir bedel vardır. Ama PLATFORM SATIŞI bir ÜRÜN faturasıdır ve
 * alıcının ürün için aldığı tek yasal belgedir: ürünün adı, adedi, kargo ve
 * hizmet bedeli ayrı satırlarda ve her satır kendi KDV oranıyla durmalıdır.
 *
 * Kalemler kesim anında snapshot'lanır (`ElogoInvoice.lineItems`): fiyat, oran ya
 * da ürün adı sonradan değişse bile kesilmiş belge ve retry'ları etkilenmez.
 */

export interface InvoiceLineItem {
  name: string;
  quantity: number;
  /** Satırın KDV HARİÇ toplamı. */
  net: number;
  /** KDV hariç birim fiyat (`net / quantity`, bölünmeden). */
  unitPrice: number;
  /** Satırın KDV oranı (%). */
  vatRate: number;
}

export interface PlatformSaleBasis {
  productName: string;
  quantity: number;
  /** Ürün satırı toplamı, KDV DAHİL (tüketici fiyatı × adet). */
  productGross: number;
  /** Alıcının ödediği kargo payı, KDV HARİÇ. */
  shippingNet: number;
  /** Alıcı hizmet bedeli + komisyonu, KDV HARİÇ. */
  buyerFeeNet: number;
  /** Ürünün kategori KDV oranı (%). */
  productVatRate: number;
  /** Kargo ve hizmet bedeline uygulanan hizmet KDV oranı (%). */
  serviceVatRate: number;
  /** İade sonrası kalan oran (1 = iade yok). */
  ratio: number;
}

const round2 = (n: number): number =>
  Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Kayıttaki JSON snapshot'ı kalemlere çevir. Bozuk/eksik satırlar SESSİZCE
 * elenir: kalem okunamıyorsa çağıran tek kalemli belgeye düşer — belge hiç
 * kesilmemesindense eksik ayrıntıyla kesilmesi yeğdir.
 */
export function readInvoiceLineItems(raw: unknown): InvoiceLineItem[] {
  if (!Array.isArray(raw)) return [];
  const lines: InvoiceLineItem[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const net = Number(r.net);
    const quantity = Math.max(1, Math.trunc(Number(r.quantity)) || 1);
    const vatRate = Number(r.vatRate);
    const name = typeof r.name === "string" ? r.name.trim() : "";
    if (!name || !Number.isFinite(net) || net <= 0) continue;
    if (!Number.isFinite(vatRate) || vatRate < 0) continue;
    const unitPrice = Number(r.unitPrice);
    lines.push({
      name,
      quantity,
      net: round2(net),
      unitPrice:
        Number.isFinite(unitPrice) && unitPrice > 0
          ? unitPrice
          : net / quantity,
      vatRate,
    });
  }
  return lines;
}

/** Kalemlerden belge toplamları — çok oranlı belgede tek oranla hesaplanamaz. */
export function invoiceTotalsFromLines(lines: InvoiceLineItem[]): {
  net: number;
  tax: number;
  total: number;
} {
  const net = round2(lines.reduce((sum, l) => sum + l.net, 0));
  const tax = round2(
    lines.reduce((sum, l) => sum + round2((l.net * l.vatRate) / 100), 0),
  );
  return { net, tax, total: round2(net + tax) };
}

const PRODUCT_FALLBACK_NAME = "Ürün bedeli";
const SHIPPING_LINE_NAME = "Kargo bedeli";
const BUYER_FEE_LINE_NAME = "Hizmet bedeli";

/** Satır toplamından kalem üret; toplam sıfırsa satır yok. */
function line(
  name: string,
  quantity: number,
  net: number,
  vatRate: number,
): InvoiceLineItem | null {
  const total = round2(net);
  if (!(total > 0)) return null;
  const count = Math.max(1, Math.trunc(quantity) || 1);
  return {
    name,
    quantity: count,
    net: total,
    // Bölünmeden bırakılır; UBL birim fiyatı 4 ondalıkla yazar ve satır toplamı
    // AYRICA taşınır, böylece 100/3 gibi bölünmeyen fiyatlarda matrah kaymaz.
    unitPrice: total / count,
    vatRate,
  };
}

/**
 * Platform satışının fatura kalemleri.
 *
 * Sipariş toplamının iskeleti (`buyerTotalOf`):
 *   subtotal (KDV DAHİL) + buyerShippingAmount (hariç) + buyerFeeAmount (hariç)
 *   + buyerServiceTaxAmount (kargo ve hizmet bedelinin KDV'si)
 *
 * Ürün satırı brütten ayrıştırılır (tüketici fiyatı KDV dahildir), kargo ve
 * hizmet bedeli ise matrah olarak durur ve üstlerine hizmet KDV'si eklenir —
 * yani üç satırın KDV dahil toplamı tahsil edilen tutara eşittir.
 *
 * Ürün tutarı çözülemezse boş döner; çağıran tek kalemli eski davranışa düşer.
 */
export function buildPlatformSaleLines(
  basis: PlatformSaleBasis,
): InvoiceLineItem[] {
  const ratio = Number.isFinite(basis.ratio) ? Math.max(0, basis.ratio) : 1;
  const productNet =
    basis.productVatRate > 0
      ? (basis.productGross * ratio) / (1 + basis.productVatRate / 100)
      : basis.productGross * ratio;

  const lines = [
    line(
      basis.productName?.trim() || PRODUCT_FALLBACK_NAME,
      basis.quantity,
      productNet,
      basis.productVatRate,
    ),
    line(
      SHIPPING_LINE_NAME,
      1,
      basis.shippingNet * ratio,
      basis.serviceVatRate,
    ),
    line(
      BUYER_FEE_LINE_NAME,
      1,
      basis.buyerFeeNet * ratio,
      basis.serviceVatRate,
    ),
  ].filter((l): l is InvoiceLineItem => l !== null);

  // Ürün satırı yoksa belge ürün faturası sayılmaz — çağıran tek kaleme düşsün.
  return lines.length > 0 && lines[0].name !== SHIPPING_LINE_NAME ? lines : [];
}
