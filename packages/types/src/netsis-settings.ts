/**
 * Netsis ayar kodlarının biçim kuralları — TEK kaynak.
 *
 * API (`netsis-invoice-settings.ts`, `netsis-accounting-settings.ts`) değeri
 * bu kurallarla ayrıştırır, admin Faturalama Ayarları ekranı aynı kurallarla
 * anında geri bildirim verir. Bir sınır değişirse (Netsis kolon uzunlukları
 * henüz doğrulanmadı) iki taraf birlikte değişir.
 *
 * VERIFY: `TBLCASABIT.CARI_KOD` varchar(15), `TBLSTSABIT.STOK_KODU`
 * varchar(35), banka/muhasebe hesap kodu (TBLBANKAHESAP / TBLMUPLAN, ör.
 * `102.01.001`) 30 karakter varsayıldı. GİB belge serisi 3 karakterdir
 * (ör. `TRD`); numara seri + 4 hane yıl + 9 hane sıradır.
 */

/** GİB belge serisinin uzunluğu. */
export const NETSIS_SERIAL_LENGTH = 3;

/** GİB belge serisi: tam 3 karakter, büyük harf ya da rakam. */
export const NETSIS_SERIAL_PATTERN = new RegExp(
  `^[A-Z0-9]{${NETSIS_SERIAL_LENGTH}}$`,
);

/** Cari kodu (`CARI_KOD`) en çok uzunluğu. */
export const NETSIS_CARI_CODE_MAX = 15;

/** Stok/hizmet kartı kodu (`STOK_KODU`) en çok uzunluğu. */
export const NETSIS_ITEM_CODE_MAX = 35;

/** Muhasebe senkronunun banka/muhasebe hesap kodu en çok uzunluğu. */
export const NETSIS_ACCOUNT_CODE_MAX = 30;

/**
 * Değer geçerli bir GİB serisi mi. Normalize EDİLMİŞ değer beklenir (kırpılmış,
 * büyük harf) — normalizasyon çağıranın işidir, kural burada.
 */
export function isValidNetsisSerial(value: string): boolean {
  return NETSIS_SERIAL_PATTERN.test(value);
}
