import type { FiscalDocumentLine } from "../provider/e-invoice-provider";

/**
 * Belgenin satır ve dip toplamları — TEK hesap yeri.
 *
 * UBL üreteci belgeyi bu sonuçla basar, teslim katmanı kaydın tutar
 * kolonlarını (matrah/KDV/toplam/iskonto) aynı sonuçtan yazar. Böylece
 * sağlayıcıya giden belge ile kayıtta duran beyan aynı hesaptan doğar;
 * sağlayıcı değişse de toplam kendi kopyasında yeniden hesaplanmaz.
 *
 * Matrah ve KDV oran BAZINDA da toplanır: bir belgede farklı oranlar
 * bulunabilir (ör. %10 ürün + %20 kargo/hizmet bedeli) ve GİB her oran için
 * ayrı vergi alt toplamı bekler.
 */
export interface FiscalLineTotals {
  /** KDV hariç satır toplamı (iskonto düşülmüş matrah). */
  lineExtension: number;
  tax: number;
  /** Satır iskontosu (matraha DAHİL DEĞİL, ondan düşülmüştür). */
  allowance: number;
}

export interface FiscalDocumentTotals {
  lineExtension: number;
  taxExclusive: number;
  tax: number;
  taxInclusive: number;
  payable: number;
  /** Belgede gösterilen toplam iskonto (matraha DAHİL DEĞİL, ondan düşülmüştür). */
  allowance: number;
}

export interface FiscalDocumentComputation {
  lines: FiscalLineTotals[];
  /** KDV oranı → o oranın matrahı ve KDV'si. */
  byRate: Map<number, { base: number; tax: number }>;
  totals: FiscalDocumentTotals;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function computeFiscalDocumentTotals(
  lines: readonly FiscalDocumentLine[],
): FiscalDocumentComputation {
  let lineExtensionSum = 0;
  let taxSum = 0;
  let allowanceSum = 0;
  const byRate = new Map<number, { base: number; tax: number }>();

  const lineTotals = lines.map((line): FiscalLineTotals => {
    const lineExt = round2(
      line.lineExtension ?? line.quantity * line.unitPrice,
    );
    const lineTax = round2(
      typeof line.taxAmount === "number" && Number.isFinite(line.taxAmount)
        ? line.taxAmount
        : (lineExt * line.vatRate) / 100,
    );
    lineExtensionSum = round2(lineExtensionSum + lineExt);
    taxSum = round2(taxSum + lineTax);
    const group = byRate.get(line.vatRate) ?? { base: 0, tax: 0 };
    byRate.set(line.vatRate, {
      base: round2(group.base + lineExt),
      tax: round2(group.tax + lineTax),
    });
    // İskonto: matrah zaten indirim düşülmüş tutardır, dolayısıyla KDV değişmez.
    const discount = line.discount;
    const allowance = round2(
      typeof discount === "number" && Number.isFinite(discount) && discount > 0
        ? discount
        : 0,
    );
    allowanceSum = round2(allowanceSum + allowance);
    return { lineExtension: lineExt, tax: lineTax, allowance };
  });

  // UBL-TR: LineExtensionAmount satır matrahlarının toplamıdır (indirim düşülmüş);
  // AllowanceTotalAmount belgede gösterilen toplam iskontodur ve
  // TaxExclusiveAmount'ı DEĞİŞTİRMEZ — indirim zaten matrahın içinden düşülmüştür.
  const taxExclusive = lineExtensionSum;
  const taxInclusive = round2(taxExclusive + taxSum);

  return {
    lines: lineTotals,
    byRate,
    totals: {
      lineExtension: lineExtensionSum,
      taxExclusive,
      tax: taxSum,
      taxInclusive,
      payable: taxInclusive,
      allowance: allowanceSum,
    },
  };
}
