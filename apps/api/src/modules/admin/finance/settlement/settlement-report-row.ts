import { invoiceRecordReference } from "../../../../common/helpers/code-prefixes";
import { sellerNetAmountOf } from "../../../order/helpers/order-net.helper";

/**
 * SATICI HAKEDİŞ DÖKÜMÜNÜN tek satırı — saf dönüşüm, veritabanı erişimi yok.
 *
 * Döküm faturanın DAYANAĞIdır: satıcıya kesilen komisyon faturasının hangi
 * siparişlerden doğduğunu ve o siparişten satıcıya ne kaldığını gösterir
 * (mali müşavire bu dosyayla birlikte iletilir).
 *
 * İki tanım burada sabitlenir ve Excel'in açıklama satırında da yazar:
 *  - **Komisyon Oranı** SATICI komisyonunun oranıdır (alıcıdan alınan komisyon
 *    değil) — satıcının faturasının konusu budur.
 *  - **Tarodan Hakedişi** satıcıdan yapılan kesintidir (komisyon + platform
 *    hizmet bedeli, KDV hariç); alıcıdan alınan komisyon/koruma bedeli buraya
 *    GİRMEZ, o alıcının kendi belgelerinin konusudur.
 *
 * Satıcı hakedişi `sellerNetAmountOf` ile hesaplanır — payout, önizleme ve bu
 * döküm aynı formülü okumak zorunda, yoksa döküm ödemeyle tutmaz.
 */

export interface SettlementOrderInput {
  orderNumber: string;
  packageNumber: string | null;
  origin: string | null;
  cancellationType: string | null;
  createdAt: Date;
  paidAt: Date | null;
  deliveredAt: Date | null;
  releaseAt: Date | null;
  quantity: number;
  subtotal: number | null;
  sellerFeeAmount: number;
  sellerCommissionAmount: number;
  sellerPlatformFeeAmount: number;
  /** Kesinti defterinden kümülatif iadeler — hakediş ve kesinti bunlarla netleşir. */
  refundedSellerCommissionAmount: number;
  refundedSellerPlatformFeeAmount: number;
  /**
   * Escrow hold'unda satıcıya ayrılan ve HÂLÂ duran para (iade düşülmüş).
   * Varsa hakediş buradan okunur: hold gerçekten ayrılan tutardır, platform-fonlu
   * kupon payını içerir ve iadeyi düşer. Yoksa formüle düşülür.
   */
  heldNet: number | null;
  sellerShippingAmount: number;
  sellerServiceTaxAmount: number;
  withholdingTaxAmount: number;
  /** Platform-fonlu kupon payı — hold yoksa nete geri eklenir. */
  platformFundedDiscount: number;
  sellerId: string;
  sellerName: string;
  sellerCompanyName: string | null;
  buyerId: string;
  buyerName: string;
  productName: string;
  productCode: string;
}

export interface SettlementRow {
  recordNo: string;
  transactionType: string;
  orderNumber: string;
  orderedAt: Date;
  country: string;
  transactionAt: Date;
  sellerId: string;
  sellerName: string;
  sellerCompanyName: string;
  productName: string;
  productCode: string;
  commissionRate: number | null;
  platformEarning: number;
  sellerEarning: number;
  withholdingTax: number;
  maturityDays: number | null;
  deliveredAt: Date | null;
  maturityAt: Date | null;
  listingPrice: number;
  customerId: string;
  customerName: string;
}

/** Platform yalnız Türkiye'ye satıyor; kolon dökümün Trendyol karşılığı için var. */
const COUNTRY = "Türkiye";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const round2 = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

const num = (value: number | null | undefined): number =>
  Number.isFinite(value) ? (value as number) : 0;

/** İşlem tipi: iptal/iade satışın önüne geçer, sonra siparişin kaynağı. */
export function settlementTransactionType(
  origin: string | null,
  cancellationType: string | null,
): string {
  if (cancellationType === "iade") return "İade";
  if (cancellationType === "iptal") return "İptal";
  if (origin === "offer") return "Teklif Satışı";
  if (origin === "platform_service") return "Platform Hizmeti";
  return "Satış";
}

/**
 * Vade süresi GÜN cinsinden: escrow serbest bırakma anı ile teslimat arasındaki
 * fark. Takvim günü değil, gerçekleşen bekleme — teslimattan önce serbest
 * bırakılmış (manuel) bir hold negatif gün üretmesin diye 0'a kırpılır.
 */
export function settlementMaturityDays(
  deliveredAt: Date | null,
  releaseAt: Date | null,
): number | null {
  if (!deliveredAt || !releaseAt) return null;
  return Math.max(
    0,
    Math.round((releaseAt.getTime() - deliveredAt.getTime()) / MS_PER_DAY),
  );
}

export function buildSettlementRow(order: SettlementOrderInput): SettlementRow {
  const subtotal = num(order.subtotal);
  const sellerCommission = num(order.sellerCommissionAmount);
  // İADE DÜŞÜLMÜŞ kesinti: dönem içinde teslim edilip iade edilen sipariş,
  // kolonu şişirmeden satırda kalır. Tamamı iade edilmişse kesinti 0'a iner
  // (kusurlu tarafta platformda kalan hizmet bedeli kadarı durur); platformun
  // iade ettiği kesinti tahsil ettiğini aşarsa tutar EKSİYE döner — işaret
  // aritmetikten doğar, satıra sonradan basılmaz.
  const netPlatformEarning = round2(
    sellerCommission -
      num(order.refundedSellerCommissionAmount) +
      num(order.sellerPlatformFeeAmount) -
      num(order.refundedSellerPlatformFeeAmount),
  );

  return {
    // Kayıt no, FATURALARIN üstünde yazanla birebir aynı olmalı: müşavir dökümü
    // belgeye bununla bağlar. Koli kodunun gövdesinden türer (KYT-…); koli yoksa
    // sipariş numarasından.
    recordNo:
      invoiceRecordReference(order.packageNumber ?? order.orderNumber) ?? "",
    transactionType: settlementTransactionType(
      order.origin,
      order.cancellationType,
    ),
    orderNumber: order.orderNumber,
    orderedAt: order.createdAt,
    country: COUNTRY,
    transactionAt: order.paidAt ?? order.createdAt,
    sellerId: order.sellerId,
    sellerName: order.sellerName,
    sellerCompanyName: order.sellerCompanyName ?? "",
    productName: order.productName,
    productCode: order.productCode,
    // Oran sipariş üzerinde saklanmıyor; tahsil edilen tutardan geri hesaplanır.
    commissionRate:
      subtotal > 0 ? round2((sellerCommission / subtotal) * 100) : null,
    platformEarning: netPlatformEarning,
    // Hakediş önce ESCROW'dan okunur: hold satıcıya gerçekten ayrılan paradır
    // ve iadeyi düşer. Hold yoksa (eski/sanal sipariş) payout'la aynı formüle
    // düşülür — iki yol da aynı sayıyı vermek zorunda.
    sellerEarning:
      order.heldNet != null
        ? round2(order.heldNet)
        : sellerNetAmountOf({
            subtotal,
            // Ürün KDV'si varsayılan olarak kapalı; açıldığında sipariş kolonundan gelir.
            productTaxAmount: 0,
            sellerFeeAmount: num(order.sellerFeeAmount),
            withholdingTaxAmount: num(order.withholdingTaxAmount),
            sellerShippingAmount: num(order.sellerShippingAmount),
            sellerServiceTaxAmount: num(order.sellerServiceTaxAmount),
            platformFundedDiscount: num(order.platformFundedDiscount),
          }),
    withholdingTax: round2(num(order.withholdingTaxAmount)),
    maturityDays: settlementMaturityDays(order.deliveredAt, order.releaseAt),
    deliveredAt: order.deliveredAt,
    maturityAt: order.releaseAt,
    // ÜRÜN TABANI: komisyonun hesaplandığı tutar. `unitPrice × adet` DEĞİL —
    // o alan kampanya fiyatını taşır (`campaignPrice ?? basePrice`), ne liste
    // fiyatıdır ne de tahsil edilen taban. Müşavirin dosyasında bu kolonla
    // komisyon oranının çarpımı komisyonu vermek zorunda; ikisi aynı tabandan
    // okunmazsa döküm kendi içinde tutmaz.
    listingPrice: subtotal,
    customerId: order.buyerId,
    customerName: order.buyerName,
  };
}
