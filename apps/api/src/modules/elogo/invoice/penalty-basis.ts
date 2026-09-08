import type { InvoiceLineItem } from "./invoice-lines";

/**
 * CEZA FATURASININ matrahı — saf hesap, veritabanı erişimi yok.
 *
 * İade politikası (`refund-financial-policy-v2.ts`) kusurlu tarafın parasını
 * zaten doğru dağıtıyor: komisyonu iade edilir (`*_refund` → iade faturası),
 * hizmet bedeli platformda kalır (`platform_retain` → mevcut belgesi ayakta
 * durur), kargo ise ona yüklenir (`*_charge`). Eksik olan tek şey `*_charge`
 * kalemlerinin BELGESİydi.
 *
 * Kural **FARKTIR**: kusurluya daha önce kesilmiş kargo belgesi iptal edilip
 * yeniden kesilmez, üstüne yalnız yeni yüklenen tutar faturalanır.
 *
 *  - **Satıcı kusurlu**: gidiş kargonun TAMAMI satıcıya yüklenir, ama satıcının
 *    kendi payı (`seller_shipping`) ona zaten faturalanmıştı → aradaki fark
 *    (alıcının payı) + iade kargosu. Belge iade hattında ters kaydedildiyse
 *    düşülecek bir şey kalmaz (bkz. `invoicedSellerShipping`).
 *  - **Alıcı kusurlu**: satıcının gidiş payı alıcıya devredilir ve iade kargosu
 *    ona yüklenir; ikisi de alıcıya hiç faturalanmamıştı → tamamı.
 *  - **Kargo/platform kusurlu**: bedel platformda kalır (`platform_absorb`),
 *    kimseye ceza kesilmez.
 */

export type PenaltyFaultParty = "buyer" | "seller" | "carrier" | "platform";

/** İade talebinin finansal bileşeni — yalnız ceza için gerekli alanlar. */
export interface PenaltyComponentRow {
  componentCode: string;
  treatment: string;
  netAmount: number;
}

export interface PenaltyBasisInput {
  faultParty: PenaltyFaultParty | null;
  components: PenaltyComponentRow[];
  /**
   * Satıcıda AYAKTA DURAN gidiş kargo belgesinin matrahı (`seller_shipping`,
   * iptal ve iade faturaları düşülmüş). Satıcı kusurunda bu tutar cezadan
   * düşülür — iade hattı belgeyi ters kaydettiyse düşülecek bir şey kalmaz.
   */
  invoicedSellerShipping: number;
  /** Hizmet KDV oranı (%) — siparişin tahsil anındaki snapshot'ı. */
  vatRate: number;
}

export interface PenaltyBasis {
  /** Belgenin muhatabı — kusurlu taraf. */
  side: "buyer" | "seller";
  /** KDV hariç matrah. */
  net: number;
  line: InvoiceLineItem;
}

export const PENALTY_LINE_NAME = "Ceza bedeli (kargo)";

const round2 = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

const positive = (value: number): number =>
  Number.isFinite(value) && value > 0 ? value : 0;

/** Bir bileşen kodunun verilen muameledeki toplamı. */
function totalOf(
  components: PenaltyComponentRow[],
  componentCode: string,
  treatment: string,
): number {
  return round2(
    components
      .filter(
        (c) => c.componentCode === componentCode && c.treatment === treatment,
      )
      .reduce((sum, c) => sum + positive(Number(c.netAmount)), 0),
  );
}

export function buildPenaltyBasis(
  input: PenaltyBasisInput,
): PenaltyBasis | null {
  const side = input.faultParty;
  if (side !== "buyer" && side !== "seller") return null;

  const treatment = side === "seller" ? "seller_charge" : "buyer_charge";
  const outboundCharge = totalOf(
    input.components,
    "outbound_shipping",
    treatment,
  );
  const returnCharge = totalOf(input.components, "return_shipping", treatment);

  // Satıcı kusurunda gidiş kargonun tamamı yüklenir; satıcının kendi payı zaten
  // faturalandığı için yalnız FARK yeni belgeye girer. Alıcı tarafında böyle bir
  // önceki belge yoktur (alıcıya devredilen satıcı payı hiç faturalanmadı).
  const outboundNet =
    side === "seller"
      ? Math.max(
          0,
          round2(outboundCharge - positive(input.invoicedSellerShipping)),
        )
      : outboundCharge;

  const net = round2(outboundNet + returnCharge);
  if (net <= 0) return null;

  const rate =
    Number.isFinite(input.vatRate) && input.vatRate > 0 ? input.vatRate : 0;
  // KDV iki hizmet için AYRI yuvarlanır (gidiş / iade kargosu) — tahsilat
  // tarafındaki yuvarlamayla aynı, birleşik matrahtan hesaplamak kuruş kaydırır.
  const taxAmount = round2(
    round2((outboundNet * rate) / 100) + round2((returnCharge * rate) / 100),
  );

  return {
    side,
    net,
    line: {
      name: PENALTY_LINE_NAME,
      quantity: 1,
      net,
      unitPrice: net,
      vatRate: rate,
      taxAmount,
    },
  };
}
