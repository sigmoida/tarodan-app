/**
 * Platform genelindeki insan-okunur kod önekleri — tek kaynak.
 *
 * İki aile vardır ve biçimleri bilinçli olarak farklıdır; koda bakan kişi
 * hangi aileden olduğunu tek bakışta anlar:
 *
 *   Varlık kodu   → tek harf + 6 hane, bitişik, SIRALI      (U010001)
 *                   Kalıcı kimlik. Gizli değil, kısa, telefonda okunabilir.
 *                   Postgres sequence + DEFAULT ile üretilir (bkz. migration).
 *
 *   İşlem referansı → üç harf + tire + 10 karakter, RASTGELE (ORD-K7X9M2QF3N)
 *                   Sayım sızdırmaz, enumerasyon edilemez. Daima
 *                   `generateUniqueReference` ile üretilir.
 *
 * Yeni bir kod türü eklerken önekini BURAYA ekleyin; çakışma testi
 * (code-prefixes.spec.ts) aynı önekin iki kez kullanılmasını engeller.
 */

/** Tek harfli varlık önekleri — Postgres tarafında üretilir. */
export const ENTITY_PREFIX = {
  /** Bireysel kullanıcı */
  individualUser: "B",
  /** Kurumsal kullanıcı */
  corporateUser: "K",
  /** Ürün / ilan */
  product: "U",
} as const;

export type EntityPrefix = (typeof ENTITY_PREFIX)[keyof typeof ENTITY_PREFIX];

/** Varlık kodu biçimi: tek harf + 6 hane (U010001). */
export const ENTITY_CODE_PATTERN = /^[A-Z]\d{6,}$/;

/**
 * Bireysel kodu kurumsala yükseltir: numara KALICI kimliktir, yalnızca önek
 * hesabın güncel tipini yansıtacak şekilde değişir (B010023 → K010023).
 * Zaten kurumsalsa ya da kod beklenen biçimde değilse `null` döner; çağıran
 * bu durumda güncelleme yapmaz.
 */
export function promoteUserCodeToCorporate(code: string): string | null {
  if (!ENTITY_CODE_PATTERN.test(code)) return null;
  if (code.startsWith(ENTITY_PREFIX.corporateUser)) return null;
  return ENTITY_PREFIX.corporateUser + code.slice(1);
}

/** Üç harfli işlem referansı önekleri — `generateUniqueReference` ile üretilir. */
export const REFERENCE_PREFIX = {
  order: "ORD",
  /** Çok satıcılı ödeme grubu (sepet) */
  checkoutGroup: "GRP",
  /**
   * Satıcı paketi = TEK fiziksel koli. Sürat'a `OzelKargoTakipNo` olarak bu
   * gönderilir ve müşteri kargosunu bu kodla sorgular. Sepette kaç satıcı varsa
   * o kadar paket kodu üretilir (1 sepet → N paket → M sipariş).
   */
  orderPackage: "PKG",
  /** Takas. Not: "TRD" e-arşiv fatura önekiyle çakıştığı için kullanılmaz. */
  trade: "TKS",
  refundRequest: "RFD",
  supportTicket: "TKT",
  /** Misafir (üye olmayan) iletişim formu kaydı */
  guestContact: "GST",
  /** Öne çıkarma / vitrin satın alma siparişi */
  boostOrder: "BST",
  /** Üyelik satın alma / yenileme siparişi */
  membershipOrder: "MEM",
  /** Satıcıya para gönderimi (PayTR platform transfer) */
  payoutTransfer: "PYT",
  /** Kargo entegrasyonu kapalıyken üretilen yedek takip numarası */
  shipmentFallback: "SHP",
  /** Hediye / kupon kodu (öneki yönetici tarafından değiştirilebilir) */
  voucher: "VCH",
} as const;

export type ReferencePrefix =
  (typeof REFERENCE_PREFIX)[keyof typeof REFERENCE_PREFIX];

/**
 * Bir işlem referansının önekini değiştirir: ORD-K7X9M2QF3N → GRP-K7X9M2QF3N.
 *
 * Tek satıcılı ödemede grup numarası sipariş numarasından TÜRETİLİR; böylece
 * tekillik sipariş numarasının tekilliğinden gelir ve iki kayıt destek
 * ekranlarında gövdesinden eşleştirilebilir.
 */
export function reprefixReference(code: string, prefix: string): string {
  const separator = code.indexOf("-");
  const body = separator === -1 ? code : code.slice(separator + 1);
  return `${prefix}-${body}`;
}

/**
 * Bizim üretmediğimiz, dış sistem/mevzuat tarafından dayatılan formatlar.
 * Bilgi amaçlıdır — bu önekler yukarıdaki ailelerde KULLANILAMAZ.
 */
export const EXTERNAL_CODE_FORMATS = {
  /** e-Arşiv/e-Fatura numarası: GİB zorunlu 16 karakter, önek ELOGO_INVOICE_PREFIX (varsayılan "TRD") */
  elogoInvoice: "TRD2026000000001",
  /** Tarodan iç fatura (PDF) numarası: aylık sıralı belge numarası */
  internalInvoice: "SPR-202607-000001",
} as const;
