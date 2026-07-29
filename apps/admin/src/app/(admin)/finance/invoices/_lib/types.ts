import type { StatusConfig } from "@tarodan/ui";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

export interface Invoice {
  id: string;
  type: string;
  typeLabel: string;
  isReturn: boolean;
  status: string;
  documentType: string;
  documentTypeLabel: string;
  invoiceNumber: string | null;
  ettn: string | null;
  recipientName: string | null;
  recipientVknTckn: string | null;
  netAmount: number;
  taxAmount: number;
  total: number;
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

export const invoiceTabs = (t: T) => [
  { key: "elogo", label: t("admin.finance.invoices.elogoTab") },
  { key: "seller", label: t("admin.finance.invoices.sellerTab") },
];

export const invoiceStatusConfig = (t: T): Record<string, StatusConfig> => ({
  pending: {
    label: t("admin.finance.invoices.status.pending"),
    variant: "warning",
  },
  sent: { label: t("admin.finance.invoices.status.sent"), variant: "success" },
  signed: { label: t("admin.finance.invoices.status.signed"), variant: "info" },
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
  { value: "commission", label: t("admin.finance.invoices.types.commission") },
  { value: "service_fee", label: t("admin.finance.invoices.types.serviceFee") },
  { value: "membership", label: t("admin.finance.invoices.types.membership") },
  { value: "boost", label: t("admin.finance.invoices.types.boost") },
  {
    value: "trade_commission",
    label: t("admin.finance.invoices.types.tradeCommission"),
  },
  {
    value: "platform_sale",
    label: t("admin.finance.invoices.types.platformSale"),
  },
  {
    value: "return_invoice",
    label: t("admin.finance.invoices.types.returnInvoice"),
  },
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

export function mapInvoices(raw: any[]): Invoice[] {
  return (raw || []).map((r: any) => ({
    id: r.id,
    type: r.type,
    typeLabel: r.typeLabel,
    isReturn: !!r.isReturn,
    status: r.status,
    documentType: r.documentType,
    documentTypeLabel: r.documentTypeLabel,
    invoiceNumber: r.invoiceNumber,
    ettn: r.ettn,
    recipientName: r.recipientName,
    recipientVknTckn: r.recipientVknTckn,
    netAmount: Number(r.netAmount || 0),
    taxAmount: Number(r.taxAmount || 0),
    total: Number(r.total || 0),
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
