import { transliterateTurkish } from "../../../common/helpers/turkish-text";

/**
 * Ad'dan slug üretir — AdminService'in private generateSlug gövdesinden
 * birebir taşındı (ortak serbest fonksiyon). CATEGORY / COLLECTION /
 * ATTRIBUTE bölümlerinin taşındığı admin servisleri bunu kullanır.
 *
 * Türkçe harfler ÖNCE ASCII'ye indirgenir: `\w` yalnız ASCII olduğu için
 * "Kırmızı" eskiden `krmz`, "Ölçek" `lek` oluyordu. Yalnız yeni üretilen
 * slug'ları etkiler; mevcut kayıtlar olduğu gibi kalır.
 */
export function generateSlug(name: string): string {
  return transliterateTurkish(name)
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
