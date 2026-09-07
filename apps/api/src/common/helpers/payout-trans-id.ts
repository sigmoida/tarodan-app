import { REFERENCE_PREFIX } from "./code-prefixes";
import {
  generateReferenceCode,
  generateUniqueReference,
} from "./generate-reference";

/**
 * PayTR Platform Transfer `trans_id`: yalnız harf/rakam, en fazla 60 karakter.
 * Bu yüzden payout referansı diğer işlem referanslarından farklı olarak TİRESİZ
 * üretilir (`PYTK7X9M2QF3N`). Tireli `PYT-…` gönderimi PayTR tarafından
 * "trans_id alfanumerik olmalidir" ile reddedildi (2026-08-31 / 09-02, 4 payout).
 *
 * Tire yalnız gönderirken silinemez: PayTR sonuç callback'i ve dönen transfer
 * listesi numarayı aldığı biçimde döndürür; veritabanı, gönderim ve geri dönüş
 * aynı biçimi taşımalı. Eski tireli satırlar işleme anında yeniden üretilir
 * (payout.service.processPendingPayouts).
 */
export const PAYOUT_TRANS_ID_PATTERN = /^[A-Z0-9]{1,60}$/;

export function isValidPayoutTransId(transId: string): boolean {
  return PAYOUT_TRANS_ID_PATTERN.test(transId);
}

/** Senkron üretim (seed gibi çakışma kontrolü olmayan yerler için). */
export function generatePayoutTransIdCode(): string {
  return generateReferenceCode(REFERENCE_PREFIX.payoutTransfer, 10, "");
}

/** Çakışma kontrollü üretim — runtime'da payout oluşturan/yenileyen TEK yol. */
export function generatePayoutTransId(
  exists: (code: string) => Promise<boolean>,
): Promise<string> {
  return generateUniqueReference(
    REFERENCE_PREFIX.payoutTransfer,
    exists,
    10,
    6,
    "",
  );
}
