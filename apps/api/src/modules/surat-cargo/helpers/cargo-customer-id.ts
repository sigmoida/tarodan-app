/**
 * Taşıyıcıya giden `MusteriId` — bir tarafın BİZİM sistemimizdeki müşteri
 * anahtarı.
 *
 * Sürat bu alanı serbest bırakıyor ve dokümanında örnek olarak telefonu
 * veriyor; entegrasyon başlangıcında da telefon gönderiyorduk. Sürat tarafı
 * telefon istemediğini bildirince kalıcı bir hesap referansına geçtik:
 * `User.adminCode` (B/S/K + 6 hane) tam bunun için üretilmiş — hesap ömrü
 * boyunca değişmez, unique ve panelde okunabilir. Telefon ikisini de sağlamaz:
 * kullanıcı numarasını değiştirebilir, iki hesap aynı numarayı paylaşabilir.
 *
 * ⚠ Misafir siparişleri TEK bir sistem kullanıcısını paylaşır
 * (`guest@tarodan.system`), dolayısıyla o kaydın `adminCode`'u kişiyi DEĞİL
 * "misafir" kovasını gösterir — gönderilirse bütün misafir kolileri Sürat'ta
 * tek cariye yığılır. e-Fatura tarafı aynı tuzağa düşmüştü, bkz.
 * `resolveGuestInvoiceRecipient`. Bu yüzden burada `undefined` dönüyoruz ve
 * mapper gönderi referansına (SatisKodu) düşüyor: koli başına ayrık, telefonsuz.
 */

import { SYSTEM_GUEST_EMAIL } from "../../elogo/invoice/elogo-guest-recipient";

/**
 * Depo tarafının sabit müşteri anahtarı. Depo bir kullanıcı kaydı değil ama
 * takas ve iade bacaklarının bir ucunda hep o var — sabit bir kod, Sürat'ta
 * tek ve tanınabilir bir cari olarak görünmesini sağlar.
 */
export const WAREHOUSE_CARGO_CUSTOMER_ID = "TARODAN-DEPO";

/** Admin test konsolunun gönderileri; gerçek bir müşteriye karışmasın. */
export const TEST_CARGO_CUSTOMER_ID = "TARODAN-TEST";

/**
 * Bir kullanıcı kaydından taşıyıcıya gidecek müşteri anahtarını çözer.
 *
 * @returns kalıcı hesap referansı, ya da kimliği temsil etmediğinde `undefined`
 *   (misafir sistem kullanıcısı, ya da kodu henüz olmayan eski kayıt) — çağıran
 *   alanı boş bırakır ve mapper referansa düşer.
 */
export function resolveCargoCustomerId(
  user: { adminCode?: string | null; email?: string | null } | null | undefined,
): string | undefined {
  if (!user) return undefined;
  if (user.email === SYSTEM_GUEST_EMAIL) return undefined;
  const code = user.adminCode?.trim();
  return code ? code : undefined;
}
