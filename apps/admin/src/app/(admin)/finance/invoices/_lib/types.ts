import type { StatusConfig } from "@tarodan/ui";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

/** Faturanın bağlı olduğu tarafın kolonda gösterilen kimliği. */
export interface InvoiceParty {
  id: string;
  /** İnsan-okur kullanıcı kodu (B010001 / K010001). */
  code: string;
  name: string;
}

export interface Invoice {
  id: string;
  type: string;
  isReturn: boolean;
  status: string;
  documentType: string;
  invoiceNumber: string | null;
  ettn: string | null;
  /** Belgenin kaynağı — koli kodu (PKG-…) ya da sipariş numarası. */
  sourceReference: string | null;
  /** Belgenin ÜZERİNDE yazan açıklama; kesim anında snapshot'lanmıştır. */
  description: string;
  /** İşlemin gerçekleşme şekli — doğrudan satış / teklif / takas / platform hizmeti. */
  context: string | null;
  /** İşlemin tarafları; belgenin muhatabı bunlardan biridir. */
  seller: InvoiceParty | null;
  buyer: InvoiceParty | null;
  recipientName: string | null;
  recipientVknTckn: string | null;
  /** Belgenin gittiği e-posta — yeniden gönderim onayında gösterilir. */
  recipientEmail: string | null;
  netAmount: number;
  taxAmount: number;
  total: number;
  /** Belgede gösterilen iskonto (KDV hariç); brüt bedel = netAmount + bu. */
  discountTotal: number;
  vatRate: number;
  billingReference: string | null;
  hasPdf: boolean;
  emailSentAt: string | null;
  resultMsg: string | null;
  issuedAt: string | null;
  createdAt: string;
}

export interface SellerInvoice {
  id: string;
  fileName: string;
  fileSize: number | null;
  uploadedAt: string;
  replacedAt: string | null;
  emailSentAt: string | null;
  orderId: string | null;
  orderNumber: string | null;
  orderTotal: number | null;
  sellerId: string | null;
  sellerName: string;
  sellerEmail: string | null;
  buyerId: string | null;
  buyerName: string;
  buyerEmail: string | null;
}

/**
 * Ekranın sekmeleri. Beşi Tarodan'ın kestiği belgelerin görünümüdür ve aynı uca
 * `scope` ile gider; "corporate" ise BAŞKA bir kaynaktır — kurumsal satıcıların
 * siparişe elle yüklediği ürün faturaları.
 *
 * Görünümler ÇAKIŞIR: bir ceza faturası hem kendi sekmesinde hem de kesildiği
 * tarafın sekmesinde görünür.
 */
export const INVOICE_TAB_KEYS = [
  "all",
  "buyer",
  "seller",
  "corporate",
  "penalty",
  "platform",
] as const;

export type InvoiceTabKey = (typeof INVOICE_TAB_KEYS)[number];

export const CORPORATE_TAB: InvoiceTabKey = "corporate";

/**
 * Sekmenin liste query'sinin kaynak adı. Her sekme AYRI önbellek tutar (aynı uç
 * ama farklı `scope`), o yüzden ad da sekmeye bağlıdır.
 */
export const invoiceListResource = (scope: string): string =>
  `invoices-${scope}`;

/**
 * Bir belge üzerinde yapılan işlemin (yeniden gönder, yeniden e-postala)
 * tazelemesi gereken listeler: sekmeler ÇAKIŞTIĞI için aynı belge birden fazla
 * sekmenin önbelleğinde durur, hepsi birden geçersizleşmeli.
 */
export const ELOGO_INVOICE_LIST_RESOURCES = INVOICE_TAB_KEYS.filter(
  (key) => key !== CORPORATE_TAB,
).map(invoiceListResource);

export const invoiceTabs = (
  t: T,
): Array<{ key: InvoiceTabKey; label: string }> => [
  { key: "all", label: t("admin.finance.invoices.allTab") },
  { key: "buyer", label: t("admin.finance.invoices.buyerTab") },
  { key: "seller", label: t("admin.finance.invoices.sellerPartyTab") },
  { key: CORPORATE_TAB, label: t("admin.finance.invoices.corporateTab") },
  { key: "penalty", label: t("admin.finance.invoices.penaltyTab") },
  { key: "platform", label: t("admin.finance.invoices.platformTab") },
];

/**
 * `?tab=` serbest metindir. Sekmeler yeniden adlandırıldığı için eski bir
 * yer imi (`?tab=elogo`) tanınmayan bir `scope` gönderirdi ve API 400 döner,
 * ekran boş kalırdı — bilinmeyen değer sessizce "Tüm Faturalar"a düşer.
 */
export const normalizeInvoiceTab = (tab: string): InvoiceTabKey =>
  (INVOICE_TAB_KEYS as readonly string[]).includes(tab)
    ? (tab as InvoiceTabKey)
    : "all";

/** İşlemin gerçekleşme şekli — API'nin `ElogoInvoiceContext` değerleriyle birebir. */
export const invoiceContextLabels = (t: T): Record<string, string> => ({
  direct_sale: t("admin.finance.invoices.contexts.directSale"),
  offer: t("admin.finance.invoices.contexts.offer"),
  trade: t("admin.finance.invoices.contexts.trade"),
  platform_service: t("admin.finance.invoices.contexts.platformService"),
});

export const contextFilterOptions = (t: T) => [
  { value: "all", label: t("admin.finance.invoices.filters.allContexts") },
  ...Object.entries(invoiceContextLabels(t)).map(([value, label]) => ({
    value,
    label,
  })),
];

/**
 * Fatura türünün etiketi. API ham `type` döndürür ve metin TEK yerde — burada —
 * durur. Belgenin `description` alanı bununla karıştırılmamalı: o çeviri değil,
 * faturanın üstünde yazan kayıttır.
 */
export const invoiceTypeLabels = (t: T): Record<string, string> =>
  Object.fromEntries(
    typeFilterOptions(t)
      .filter((option) => option.value !== "all")
      .map((option) => [option.value, option.label]),
  );

/** Belge tipi rozeti — mükellefe kesilen e-Fatura mı, e-Arşiv mi. */
export const documentTypeLabel = (t: T, documentType: string): string =>
  documentType === "EINVOICE"
    ? t("admin.finance.invoices.documentTypes.invoice")
    : t("admin.finance.invoices.documentTypes.archive");

export const invoiceStatusConfig = (t: T): Record<string, StatusConfig> => ({
  pending: {
    label: t("admin.finance.invoices.status.pending"),
    variant: "warning",
  },
  // Sağlayıcıya gönderilmekte olan belge; durum filtresinde de görünmeliydi —
  // yoksa "Beklemede" seçen operatör gönderimde takılmış belgeyi hiç bulamıyor.
  processing: {
    label: t("admin.finance.invoices.status.processing"),
    variant: "info",
  },
  sent: { label: t("admin.finance.invoices.status.sent"), variant: "success" },
  signed: {
    label: t("admin.finance.invoices.status.signed"),
    variant: "success",
  },
  failed: {
    label: t("admin.finance.invoices.status.failed"),
    variant: "danger",
  },
  cancelled: {
    label: t("admin.finance.invoices.status.cancelled"),
    variant: "secondary",
  },
});

export const typeFilterOptions = (t: T) => [
  { value: "all", label: t("admin.finance.invoices.filters.allTypes") },
  {
    value: "buyer_commission",
    label: t("admin.finance.invoices.types.buyerCommission"),
  },
  {
    value: "buyer_service_fee",
    label: t("admin.finance.invoices.types.buyerServiceFee"),
  },
  {
    value: "buyer_shipping",
    label: t("admin.finance.invoices.types.buyerShipping"),
  },
  {
    value: "seller_commission",
    label: t("admin.finance.invoices.types.sellerCommission"),
  },
  {
    value: "seller_platform_fee",
    label: t("admin.finance.invoices.types.sellerPlatformFee"),
  },
  {
    value: "seller_shipping",
    label: t("admin.finance.invoices.types.sellerShipping"),
  },
  // Birleşik nesil: yalnız eski kayıtlarda ve kesinti kırılımı olmayan
  // paketlerde vardır; filtreden düşerse o belgeler görünmez olur.
  { value: "commission", label: t("admin.finance.invoices.types.commission") },
  { value: "service_fee", label: t("admin.finance.invoices.types.serviceFee") },
  { value: "membership", label: t("admin.finance.invoices.types.membership") },
  { value: "boost", label: t("admin.finance.invoices.types.boost") },
  {
    value: "trade_commission",
    label: t("admin.finance.invoices.types.tradeCommission"),
  },
  {
    value: "trade_service_fee",
    label: t("admin.finance.invoices.types.tradeServiceFee"),
  },
  {
    value: "trade_shipping",
    label: t("admin.finance.invoices.types.tradeShipping"),
  },
  {
    value: "platform_sale",
    label: t("admin.finance.invoices.types.platformSale"),
  },
  {
    value: "return_invoice",
    label: t("admin.finance.invoices.types.returnInvoice"),
  },
  { value: "penalty", label: t("admin.finance.invoices.types.penalty") },
];

export const statusFilterOptions = (t: T) => [
  { value: "all", label: t("admin.finance.invoices.filters.allStatuses") },
  ...Object.entries(invoiceStatusConfig(t)).map(([value, config]) => ({
    value,
    label: config.label,
  })),
];

export const documentTypeFilterOptions = (t: T) => [
  { value: "all", label: t("admin.finance.invoices.filters.allDocuments") },
  {
    value: "EARCHIVE",
    label: t("admin.finance.invoices.documentTypes.archive"),
  },
  {
    value: "EINVOICE",
    label: t("admin.finance.invoices.documentTypes.invoice"),
  },
];

const mapParty = (raw: any): InvoiceParty | null =>
  raw?.id ? { id: raw.id, code: raw.code ?? "", name: raw.name ?? "" } : null;

export function mapInvoices(raw: any[]): Invoice[] {
  return (raw || []).map((r: any) => ({
    id: r.id,
    type: r.type,
    isReturn: !!r.isReturn,
    status: r.status,
    documentType: r.documentType,
    invoiceNumber: r.invoiceNumber,
    ettn: r.ettn,
    sourceReference: r.sourceReference ?? null,
    description: r.description ?? "",
    context: r.context ?? null,
    seller: mapParty(r.seller),
    buyer: mapParty(r.buyer),
    recipientName: r.recipientName,
    recipientVknTckn: r.recipientVknTckn,
    recipientEmail: r.recipientEmail ?? null,
    netAmount: Number(r.netAmount || 0),
    taxAmount: Number(r.taxAmount || 0),
    total: Number(r.total || 0),
    discountTotal: Number(r.discountTotal || 0),
    vatRate: Number(r.vatRate || 0),
    billingReference: r.billingReference,
    hasPdf: !!r.hasPdf,
    emailSentAt: r.emailSentAt,
    resultMsg: r.resultMsg,
    issuedAt: r.issuedAt,
    createdAt: r.createdAt,
  }));
}

export function mapSellerInvoices(raw: any[]): SellerInvoice[] {
  return (raw || []).map((r: any) => ({
    id: r.id,
    fileName: r.fileName,
    fileSize: r.fileSize != null ? Number(r.fileSize) : null,
    uploadedAt: r.uploadedAt,
    replacedAt: r.replacedAt,
    emailSentAt: r.emailSentAt,
    orderId: r.orderId,
    orderNumber: r.orderNumber,
    orderTotal: r.orderTotal != null ? Number(r.orderTotal) : null,
    sellerId: r.sellerId,
    sellerName: r.sellerName,
    sellerEmail: r.sellerEmail,
    buyerId: r.buyerId,
    buyerName: r.buyerName,
    buyerEmail: r.buyerEmail,
  }));
}
