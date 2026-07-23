/**
 * Sürat Kargo gönderi alanları için adres/telefon normalizasyonu.
 *
 * Sürat il/ilçe'yi İSİM olarak, telefonu ulusal formatta bekler. Kullanıcı
 * verisi (özellikle telefon) "+90 555 ...", "0 555 ...", "905..." gibi farklı
 * biçimlerde gelebildiğinden, Sürat'a göndermeden önce tek biçime indiriyoruz.
 */

import {
  SuratKargoTuru,
  SuratOdemeTipi,
  SuratTasimaSekli,
  SuratTeslimSekli,
  SuratGonderiSekli,
  SuratKapidanOdemeTahsilatTipi,
  type SuratGonderiPayload,
} from "./surat-cargo.types";

/** Telefonu `05XXXXXXXXX` (11 hane) biçimine indirger. Çözemezse en iyi çabayla
 *  rakamları döndürür (boşsa boş string). */
export function normalizeSuratPhone(raw?: string | null): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (!digits) return "";

  let national = digits;
  // Ülke kodu (+90 / 90) varsa düş
  if (national.startsWith("90") && national.length >= 12) {
    national = national.slice(2);
  }
  // Baştaki 0'ı düş
  if (national.startsWith("0")) {
    national = national.slice(1);
  }
  // Geçerli GSM: 10 hane ve 5 ile başlar → 0 ekleyip döndür
  if (national.length === 10 && national.startsWith("5")) {
    return "0" + national;
  }
  // Çözemedik: olduğu gibi (0 ile başlayacak şekilde) döndür
  return digits.startsWith("0") ? digits : "0" + digits;
}

/** İl/ilçe isimlerini Sürat için temizler (baştaki/sondaki boşluk + çoklu boşluk). */
export function normalizeSuratLocation(raw?: string | null): string {
  return (raw ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Faz 11.4a — Tek standart Sürat gönderi zarfı üreticisi.
 *
 * order/refund/trade/admin akışlarında 6+ kez BİREBİR tekrarlanan
 * `SuratGonderiPayload` literalini tek noktadan kurar. Yalnızca değişken alanlar
 * (alıcı adı/adres/il/ilçe/telefon/referans/içerik/iade bayrağı) input olarak
 * verilir; standart zarf sabitleri (Koli/Peşin/1 adet/1 desi/1 kg/Nakit/karayolu/
 * adrese teslim/standart/pazaryeri=0) burada tutulur.
 *
 * Normalizasyon TEK noktadadır (burada): il/ilçe `normalizeSuratLocation`,
 * telefon `normalizeSuratPhone`'dan geçer — çağıran HAM değer geçmelidir.
 * `overrides` EN SON spread edilir; böylece çağırana özgü sapmalar (ör. farklı
 * KisiKurum fallback mantığı ya da bilinçli olarak ham bırakılmış bir alan)
 * standart değeri ezer ve davranış birebir korunur.
 */
export function buildStandardGonderiPayload(input: {
  recipientName: string;
  address: string;
  city: string;
  district: string;
  phone: string;
  /** OzelKargoTakipNo (müşteri sipariş/işlem referansı) */
  ref: string;
  /** SahisBirim (ürün/gönderi başlığı) — verilmezse alan boş bırakılır */
  content?: string;
  /** Iademi bayrağı — varsayılan false (standart gönderi) */
  isReturn?: boolean;
  /** Çağırana özgü sapmalar; standart değerleri ezmek için en son uygulanır */
  overrides?: Partial<SuratGonderiPayload>;
}): SuratGonderiPayload {
  return {
    KisiKurum: input.recipientName.trim() || "Alıcı",
    SahisBirim: input.content,
    AliciAdresi: input.address,
    Il: normalizeSuratLocation(input.city),
    Ilce: normalizeSuratLocation(input.district),
    TelefonCep: normalizeSuratPhone(input.phone),
    KargoTuru: SuratKargoTuru.Koli,
    OdemeTipi: SuratOdemeTipi.Pesin,
    OzelKargoTakipNo: input.ref,
    Adet: 1,
    BirimDesi: 1,
    BirimKg: 1,
    KapidanOdemeTahsilatTipi: SuratKapidanOdemeTahsilatTipi.Nakit,
    TasimaSekli: SuratTasimaSekli.KaraYolu,
    TeslimSekli: SuratTeslimSekli.AdreseTeslim,
    GonderiSekli: SuratGonderiSekli.Standart,
    Pazaryerimi: 0,
    Iademi: input.isReturn ?? false,
    ...input.overrides,
  };
}
