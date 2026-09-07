/**
 * Finans Özeti v2 — sağlamalı bölümler. Her bölümde sol toplam sağdaki
 * bileşenlerin toplamına eşit olmak zorundadır; fark satırı 0 değilse ekran
 * kırmızı gösterir. Tüm zaman (kuruluştan bugüne), dönem yok.
 */
export interface ReconciliationLine {
  /** i18n yaprağı: admin.finance.overview.sections.<section>.lines.<key> */
  key: string;
  /** İşaretli tutar; negatif satırlar "−" ile basılır. */
  amount: number;
  count?: number;
  href?: string;
  /** PayTR rapor senkronu kapalıyken bu satır eksik/0'dır → rozet. */
  syncDependent?: boolean;
}

export type ReconciliationSectionKind =
  /** total = Σ components; fark hesaplanır, 0 olmalı. */
  | "identity"
  /** total + Σ components (işaretli) = result; fark yok, "Sonuç" satırı var. */
  | "waterfall"
  /** total = Σ components; son bileşen kalan (artık) — bilgi amaçlı, fark yok. */
  | "breakdown";

export interface ReconciliationSection {
  key:
    | "revenueSplit"
    | "sellerShare"
    | "tradeCounterpart"
    | "platformNet"
    | "buyerRefunds";
  kind: ReconciliationSectionKind;
  /** Bölümün kapsamı: akış (tüm zaman) ya da stok (anlık). */
  scope: "allTime" | "instant";
  total: ReconciliationLine;
  components: ReconciliationLine[];
  /** identity: round2(total − Σ components); diğerlerinde 0. */
  difference: number;
  balanced: boolean;
  /** waterfall: total + Σ components. */
  result?: ReconciliationLine;
}

export interface ComparisonRow {
  key: "sales" | "refunds" | "pspFee" | "settlementNet" | "payouts";
  ours: number;
  theirs: number;
  difference: number;
  balanced: boolean;
  /** Ek açıklama sayısı (ör. sonucu bekleyen payout adedi). */
  count?: number;
  /** Fark yapısal olarak sıfır olamaz (valör gecikmesi); kırmızı değil, bilgi. */
  informational?: boolean;
}

export interface ComparisonSection {
  key: "psp";
  syncEnabled: boolean;
  /** Karşılaştırmanın kapsadığı ilk PayTR döküm günü (YYYY-MM-DD); yoksa null. */
  coverageFrom: string | null;
  rows: ComparisonRow[];
}

export interface ReconciliationDiagnostics {
  /** Tamamlanmış ödeme ama sipariş/takas/sanal kaydı bulunamadı. */
  paymentsWithoutOrders: number;
  /** Ödenmiş fiziksel sipariş ama PaymentHold yok (S1 farkını üretir). */
  ordersWithoutHold: number;
  /** Order.taxAmount sabit 0 olmalı; değilse kod tutarsızlığı. */
  productTaxTotal: number;
  /** Σ Order.commissionAmount − Σ CommissionLedger(sellerCommission+buyerFee). */
  commissionLedgerDrift: number;
}

export const RECONCILIATION_EPSILON = 0.01;

/** Kuruşa yuvarlar; −0 üretmez (JSON'da ve eşitlik testinde 0'dan ayrışırdı). */
export const round2 = (n: number): number => {
  const r = Math.round(n * 100) / 100;
  return r === 0 ? 0 : r;
};

export function balancedAmount(n: number): boolean {
  return Math.abs(n) <= RECONCILIATION_EPSILON;
}
