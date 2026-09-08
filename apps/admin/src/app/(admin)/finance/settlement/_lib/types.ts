/**
 * Satıcı hakediş dökümü satırı — kesilen komisyon faturasının dayanağı.
 * Kolon anlamları API tarafındaki `settlement-report-row.ts`'te tanımlıdır;
 * Excel'in "Aciklama" sayfası da aynı tanımları taşır.
 */
export interface SettlementRow {
  recordNo: string;
  transactionType: string;
  orderNumber: string;
  orderedAt: string;
  country: string;
  transactionAt: string;
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
  deliveredAt: string | null;
  maturityAt: string | null;
  listingPrice: number;
  customerId: string;
  customerName: string;
}

export function mapSettlementRows(raw: any[]): SettlementRow[] {
  return (raw || []).map((r: any) => ({
    recordNo: r.recordNo ?? "",
    transactionType: r.transactionType ?? "",
    orderNumber: r.orderNumber ?? "",
    orderedAt: r.orderedAt,
    country: r.country ?? "",
    transactionAt: r.transactionAt,
    sellerId: r.sellerId ?? "",
    sellerName: r.sellerName ?? "",
    sellerCompanyName: r.sellerCompanyName ?? "",
    productName: r.productName ?? "",
    productCode: r.productCode ?? "",
    commissionRate: r.commissionRate != null ? Number(r.commissionRate) : null,
    platformEarning: Number(r.platformEarning || 0),
    sellerEarning: Number(r.sellerEarning || 0),
    withholdingTax: Number(r.withholdingTax || 0),
    maturityDays: r.maturityDays != null ? Number(r.maturityDays) : null,
    deliveredAt: r.deliveredAt ?? null,
    maturityAt: r.maturityAt ?? null,
    listingPrice: Number(r.listingPrice || 0),
    customerId: r.customerId ?? "",
    customerName: r.customerName ?? "",
  }));
}
