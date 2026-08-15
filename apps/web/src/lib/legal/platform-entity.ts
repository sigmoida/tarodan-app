/** @format */
import type { Translate } from "@/types/i18n";

/**
 * Platformu işleten tüzel kişinin künyesi — hukuki metinlerin TEK kaynağı.
 *
 * Mesafeli satış sözleşmesi, ön bilgilendirme formu ve KVKK aydınlatma metni
 * aynı künyeyi taşımak zorunda: biri güncellenip diğeri eskide kalırsa
 * belgeler birbiriyle çelişir ve tebligat/başvuru adresi yanlış kalır.
 *
 * DEĞERLER çevrilmez — ticaret unvanı, vergi numarası ve tebligat adresi hukuki
 * kimliktir ve her dilde birebir aynı görünmek zorundadır. Yalnız aşağıdaki
 * ALAN ETİKETLERİ katalogdan gelir.
 */
/* eslint-disable @tarodan/no-hardcoded-turkish -- legal identity data, identical in every locale */
export const PLATFORM_ENTITY = {
  brand: "TARODAN",
  legalName:
    "Serhatlar Oyuncak Temizlik Gıda Maddeleri İnşaat Sanayi ve Ticaret Limited Şirketi",
  /** Sözleşme metnindeki haliyle: vergi/MERSİS numarası ve bağlı olunan yer. */
  taxRegistration: "7620277268 – Torbalı / İZMİR",
  address: "Yenişehir Mah. 1145/2 No:3 Torbalı / İZMİR",
  phone: "0 232 433 41 42",
  email: "destek@tarodan.com.tr",
  kep: "serhatlaroyuncak@hs03.kep.tr",
  website: "www.tarodan.com.tr",
} as const;
/* eslint-enable @tarodan/no-hardcoded-turkish */

/** Künyenin hukuki metinlerde tekrarlanan "etiket: değer" dökümü. */
export const PLATFORM_ENTITY_FIELDS = (
  t: Translate,
): { label: string; value: string }[] => [
  { label: t("legal.entity.legalName"), value: PLATFORM_ENTITY.legalName },
  { label: t("legal.entity.brand"), value: PLATFORM_ENTITY.brand },
  {
    label: t("legal.entity.taxRegistration"),
    value: PLATFORM_ENTITY.taxRegistration,
  },
  { label: t("legal.entity.address"), value: PLATFORM_ENTITY.address },
  { label: t("legal.entity.phone"), value: PLATFORM_ENTITY.phone },
  { label: t("legal.entity.email"), value: PLATFORM_ENTITY.email },
  { label: t("legal.entity.kep"), value: PLATFORM_ENTITY.kep },
];
