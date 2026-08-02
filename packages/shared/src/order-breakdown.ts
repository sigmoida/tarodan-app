/**
 * Sipariş para kırılımının TEK kaynağı — ekranlar için.
 *
 * Tutarları API hesaplar ve siparişte saklar; burası yalnız o tutarları
 * ekranların gösterdiği kalem listesine çevirir. Hiçbir ekran kendi başına
 * "komisyon + KDV" toplamasın diye tek yerde toplanmıştır: admin kural
 * önizlemesi, admin sipariş dosyası, finans ekranları ve web hep bunu kullanır.
 *
 * İki kural:
 *
 *  1. KALEM GİZLENMEZ. Bir kural o kalemi tanımlamıyorsa satır yine döner,
 *     tutarı 0'dır. Satıcı "platform hizmet bedeli" satırını görmediğinde
 *     bunun sıfır mı yoksa gizli mi olduğunu bilemiyor; sıfır göstermek bu
 *     belirsizliği kaldırır.
 *
 *  2. KDV KALEM BAZINDA YUVARLANIR. `apps/api/src/modules/order/
 *     order-service-tax.helper.ts` her hizmet satırının KDV'sini ayrı ayrı
 *     kuruşa yuvarlayıp sonra topluyor; burada da aynısı yapılır, aksi halde
 *     ekranda görünen KDV toplamı siparişte saklanan tutardan kuruş sapar.
 *
 * Hizmet KDV oranı siparişte snapshot'lanır (`Order.serviceVatRate`): oran
 * sonradan değişse bile eski sipariş, tahsil edildiği oranla gösterilir.
 */

export type OrderBreakdownLineKey =
  | "sellerCommission"
  | "sellerShipping"
  | "sellerPlatformFee"
  | "buyerCommission"
  | "buyerShipping"
  | "buyerServiceFee";

export interface OrderBreakdownLine {
  /** Ekranın çeviri anahtarı olarak kullandığı sabit kimlik. */
  key: OrderBreakdownLineKey;
  /** Kalemin kendi tutarı (KDV hariç). Tanımsız kalemde 0. */
  amount: number;
  /** Bu kalemin KDV'si; hizmet KDV'si kapalıyken 0. */
  vat: number;
}

export interface OrderBreakdownInput {
  /** Ürün bedeli (indirim sonrası, KDV hariç). */
  subtotal: number;
  sellerCommissionAmount?: number | null;
  sellerPlatformFeeAmount?: number | null;
  /** Satıcının üstlendiği kargo payı. */
  sellerShippingAmount?: number | null;
  buyerCommissionAmount?: number | null;
  buyerServiceFeeAmount?: number | null;
  /** Alıcıdan tahsil edilen kargo payı. */
  buyerShippingAmount?: number | null;
  /** Stopaj — yalnız kurumsal satıcıda doğar. */
  withholdingTaxAmount?: number | null;
  /** Hizmet KDV oranı (%). 0/boş → KDV satırları 0 döner. */
  serviceVatRate?: number | null;
  /** Ürün KDV'si; `product_vat_enabled` kapalıyken 0. */
  productTaxAmount?: number | null;
}

export interface OrderBreakdownSide {
  lines: OrderBreakdownLine[];
  /** Kalem KDV'lerinin toplamı. */
  vatTotal: number;
}

export interface OrderSellerBreakdown extends OrderBreakdownSide {
  withholding: number;
  /** Ürün bedelinden düşülen her şey. */
  deductionTotal: number;
  /** Satıcının eline geçen. */
  net: number;
}

export interface OrderBuyerBreakdown extends OrderBreakdownSide {
  /** Ürün bedelinin üstüne eklenen toplam. */
  addedTotal: number;
  /** Alıcının ödediği. */
  payable: number;
}

export interface OrderPlatformBreakdown {
  /** Tarodan'da kalan: dört ücret kalemi (KDV hariç). */
  revenue: number;
  /** Devlete giden: hizmet KDV'si (iki taraf) + stopaj. */
  tax: number;
  /** Kargoya giden (iki tarafın payı toplamı). */
  shipping: number;
  /** Ürün bedeline oranla Tarodan'ın payı (%). */
  takeRate: number;
}

export interface OrderBreakdown {
  subtotal: number;
  productTax: number;
  seller: OrderSellerBreakdown;
  buyer: OrderBuyerBreakdown;
  platform: OrderPlatformBreakdown;
}

const round2 = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

/** Negatif/NaN girdi kalem üretemez — 0'a düşer. */
const amount = (value: number | null | undefined): number =>
  Number.isFinite(value) && (value as number) > 0 ? (value as number) : 0;

const sum = (values: number[]): number =>
  round2(values.reduce((total, value) => total + value, 0));

/**
 * Kalem listesi — sırası ekranda göründüğü sıradır ve tanımsız kalemler de
 * 0 tutarla yer alır.
 */
function linesFor(
  entries: Array<[OrderBreakdownLineKey, number]>,
  vatRate: number,
): OrderBreakdownLine[] {
  return entries.map(([key, value]) => ({
    key,
    amount: round2(value),
    vat: round2(value * (vatRate / 100)),
  }));
}

export function buildOrderBreakdown(
  input: OrderBreakdownInput,
): OrderBreakdown {
  const rate =
    Number.isFinite(input.serviceVatRate) &&
    (input.serviceVatRate as number) > 0
      ? (input.serviceVatRate as number)
      : 0;

  const subtotal = amount(input.subtotal);
  const productTax = amount(input.productTaxAmount);
  const withholding = amount(input.withholdingTaxAmount);

  const sellerCommission = amount(input.sellerCommissionAmount);
  const sellerPlatformFee = amount(input.sellerPlatformFeeAmount);
  const sellerShipping = amount(input.sellerShippingAmount);
  const buyerCommission = amount(input.buyerCommissionAmount);
  const buyerServiceFee = amount(input.buyerServiceFeeAmount);
  const buyerShipping = amount(input.buyerShippingAmount);

  // Sıra tabloyla aynı: komisyon → kargo → hizmet bedeli.
  const sellerLines = linesFor(
    [
      ["sellerCommission", sellerCommission],
      ["sellerShipping", sellerShipping],
      ["sellerPlatformFee", sellerPlatformFee],
    ],
    rate,
  );
  const buyerLines = linesFor(
    [
      ["buyerCommission", buyerCommission],
      ["buyerShipping", buyerShipping],
      ["buyerServiceFee", buyerServiceFee],
    ],
    rate,
  );

  const sellerVatTotal = sum(sellerLines.map((line) => line.vat));
  const buyerVatTotal = sum(buyerLines.map((line) => line.vat));

  const sellerDeductionTotal = sum([
    ...sellerLines.map((line) => line.amount),
    sellerVatTotal,
    withholding,
  ]);
  // Ürün KDV'si alıcıdan tahsil edilip satıcıya AKTARILIR; kesinti değildir.
  const sellerNet = Math.max(
    0,
    round2(subtotal + productTax - sellerDeductionTotal),
  );

  const buyerAddedTotal = sum([
    ...buyerLines.map((line) => line.amount),
    buyerVatTotal,
  ]);
  const buyerPayable = round2(subtotal + productTax + buyerAddedTotal);

  const revenue = sum([
    sellerCommission,
    sellerPlatformFee,
    buyerCommission,
    buyerServiceFee,
  ]);

  return {
    subtotal,
    productTax,
    seller: {
      lines: sellerLines,
      vatTotal: sellerVatTotal,
      withholding,
      deductionTotal: sellerDeductionTotal,
      net: sellerNet,
    },
    buyer: {
      lines: buyerLines,
      vatTotal: buyerVatTotal,
      addedTotal: buyerAddedTotal,
      payable: buyerPayable,
    },
    platform: {
      revenue,
      // Ürün KDV'si satıcıya aktarıldığı için platformun vergi yükü değildir.
      tax: sum([sellerVatTotal, buyerVatTotal, withholding]),
      shipping: sum([sellerShipping, buyerShipping]),
      takeRate: subtotal > 0 ? round2((revenue / subtotal) * 100) : 0,
    },
  };
}
