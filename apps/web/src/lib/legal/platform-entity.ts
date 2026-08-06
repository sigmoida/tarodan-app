/** @format */

/**
 * Platformu işleten tüzel kişinin künyesi — hukuki metinlerin TEK kaynağı.
 *
 * Mesafeli satış sözleşmesi, ön bilgilendirme formu ve KVKK aydınlatma metni
 * aynı künyeyi taşımak zorunda: biri güncellenip diğeri eskide kalırsa
 * belgeler birbiriyle çelişir ve tebligat/başvuru adresi yanlış kalır.
 */
export const PLATFORM_ENTITY = {
  brand: "TARODAN",
  legalName:
    "Serhatlar Oyuncak Temizlik Gıda Maddeleri İnşaat San. Tic. Ltd. Şti.",
  /** Sözleşme metnindeki haliyle: vergi/MERSİS numarası ve bağlı olunan yer. */
  taxRegistration: "7620277268 — Torbalı/İZMİR",
  address: "Yenişehir Mah. 1145/2 No:3 Gıda Çarşısı, Konak/İZMİR",
  phone: "0 232 433 41 42",
  email: "destek@tarodan.com.tr",
  kep: "serhatlaroyuncak@hs03.kep.tr",
  website: "www.tarodan.com.tr",
} as const;

/** Künyenin hukuki metinlerde tekrarlanan "etiket: değer" dökümü. */
export const PLATFORM_ENTITY_FIELDS: { label: string; value: string }[] = [
  { label: "Unvan", value: PLATFORM_ENTITY.legalName },
  { label: "Marka", value: PLATFORM_ENTITY.brand },
  { label: "Vergi / MERSİS No", value: PLATFORM_ENTITY.taxRegistration },
  { label: "Adres", value: PLATFORM_ENTITY.address },
  { label: "Telefon", value: PLATFORM_ENTITY.phone },
  { label: "E-posta", value: PLATFORM_ENTITY.email },
  { label: "KEP", value: PLATFORM_ENTITY.kep },
];
