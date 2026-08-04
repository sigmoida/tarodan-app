/**
 * Fatura tarih/saat biçimlendirmesi — TEK takvim: Türkiye.
 *
 * Belgenin tarihi, saati ve numara yılı aynı takvimden okunmak ZORUNDA: üçü
 * ayrışırsa belge kendi içinde çelişir ve yasal düzenlenme tarihi kayar.
 *
 * Eskiden tarih `toISOString()` (UTC), saat `toTimeString()` (süreç yerel saati)
 * ile üretiliyordu. Sunucu UTC koştuğu için tüm belgeler Türkiye saatinden 3 saat
 * geri düşüyor, gece yarısından sonra kesilen fatura bir önceki güne yazılıyordu;
 * 31 Aralık gecesinde ise numara yılı ile belge tarihi farklı yıllara düşüyor ve
 * boşluksuz (gap-free) numara sırası bozuluyordu.
 *
 * Takvim ilkelinin kendisi `common/helpers/tr-calendar` içindedir — ürün model
 * yılı gibi başka alanlar da aynı yorumu kullanır.
 */

import {
  TR_TIME_ZONE,
  trCalendarDate,
  trCalendarTime,
  trCalendarYear,
} from "../../common/helpers/tr-calendar";

export const INVOICE_TIME_ZONE = TR_TIME_ZONE;

/** UBL `cbc:IssueDate` — yyyy-mm-dd, Türkiye takvimi. */
export const invoiceIssueDate = trCalendarDate;

/** UBL `cbc:IssueTime` — HH:mm:ss, Türkiye saati. */
export const invoiceIssueTime = trCalendarTime;

/** Belge numarası sırasının yılı — belge tarihiyle AYNI takvimden. */
export const invoiceIssueYear = trCalendarYear;
