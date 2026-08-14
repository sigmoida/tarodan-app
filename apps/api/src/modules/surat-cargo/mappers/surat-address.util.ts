/**
 * Sürat Kargo gönderi alanları için adres/telefon normalizasyonu.
 *
 * Sürat il/ilçe'yi İSİM olarak, telefonu ulusal formatta bekler. Kullanıcı
 * verisi (özellikle telefon) "+90 555 ...", "0 555 ...", "905..." gibi farklı
 * biçimlerde gelebildiğinden, Sürat'a göndermeden önce tek biçime indiriyoruz.
 */

import { BadRequestException } from "@nestjs/common";
import { i18nMessage } from "../../i18n";
import {
  SuratKargoTuru,
  SuratOdemeTipi,
  SuratTasimaSekli,
  SuratTeslimSekli,
  SuratGonderiSekli,
  type SuratGonderiPayload,
} from "../helpers/surat-cargo.types";

/** Telefonu `05XXXXXXXXX` (11 hane) biçimine indirger. Çözemezse boş string. */
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
  // Çözemedik. Eskiden başına 0 eklenip gönderiliyordu; bu, TR olmayan bir
  // numarayı (+447700900123 → 0447700900123) sessizce uydurma bir TR numarasına
  // çevirip kuryeye yolluyordu. Boş dönmek, çağıranın eksikliği fark etmesini
  // sağlar — bozuk bir numarayla gönderi açmaktan iyidir.
  return "";
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
  /** Checkout sırasında snapshot alınan paket desisi. */
  desi?: number;
  /** Çağırana özgü sapmalar; standart değerleri ezmek için en son uygulanır */
  overrides?: Partial<SuratGonderiPayload>;
}): SuratGonderiPayload {
  // Tek çıkış noktası: çözülemeyen numarayla gönderi açmak yerine burada dur.
  // Yazma yollarının hepsi artık +905XXXXXXXXX doğruluyor, dolayısıyla buraya
  // ancak kural öncesinden kalan bozuk bir kayıt düşebilir — ve o durumda
  // kuryeye uydurma numara göndermektense net hata vermek gerekir.
  const phone = normalizeSuratPhone(input.phone);
  if (!phone) {
    throw new BadRequestException(
      i18nMessage("server.shipping.invalidRecipientPhone"),
    );
  }

  return {
    KisiKurum: input.recipientName.trim() || "Alıcı",
    SahisBirim: input.content,
    AliciAdresi: input.address,
    Il: normalizeSuratLocation(input.city),
    Ilce: normalizeSuratLocation(input.district),
    TelefonCep: phone,
    KargoTuru: SuratKargoTuru.Koli,
    OdemeTipi: SuratOdemeTipi.Pesin,
    OzelKargoTakipNo: input.ref,
    Adet: 1,
    BirimDesi:
      Number.isInteger(input.desi) && Number(input.desi) > 0
        ? Number(input.desi)
        : 1,
    BirimKg: 1,
    // Peşin gönderide kapıdan ödeme alanı resmi dokümana göre 0 olmalıdır.
    KapidanOdemeTahsilatTipi: 0,
    TasimaSekli: SuratTasimaSekli.KaraYolu,
    TeslimSekli: SuratTeslimSekli.AdreseTeslim,
    GonderiSekli: SuratGonderiSekli.Standart,
    Pazaryerimi: 0,
    Iademi: input.isReturn ?? false,
    ...input.overrides,
  };
}
