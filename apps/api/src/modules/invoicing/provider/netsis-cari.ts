/**
 * Netsis'te bir tarafın HANGİ cariye yazıldığının kuralı — TEK yer.
 *
 * VKN'li (10 hane, tüzel kişi) taraf kendi carisine yazılır; cari kodu
 * kullanıcının B/K kodudur (`adminCode`, docs/CODE_SCHEME.md). TCKN'li
 * bireysel taraf ve misafir, muhasebenin açtığı ORTAK perakende cariye
 * (`netsis.cari.retailCode`) yazılır; kişinin kimliği kaydın açıklamasında
 * taşınır. Fatura sağlayıcısı (`netsis.provider.ts`) ve muhasebe senkronu
 * (`accounting/`) aynı kuralı buradan okur — biri değişip diğeri eski kuralla
 * kalırsa tahsilat faturanın carisinden başka bir cariye düşerdi.
 */

/** VKN 10 hanedir (tüzel kişi); TCKN 11. */
export const NETSIS_VKN_LENGTH = 10;

const digitsOf = (value: string | null | undefined): string =>
  (value ?? "").replace(/\D/g, "");

/** Taraf kendi (kurumsal) carisine mi yazılır? Değilse ortak perakende cari. */
export function isNetsisCorporateTaxId(
  taxId: string | null | undefined,
): boolean {
  return digitsOf(taxId).length === NETSIS_VKN_LENGTH;
}
