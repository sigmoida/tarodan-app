/**
 * Nötr gönderiyi `GonderiOlustur` (v2) alanlarına eşler.
 *
 * `surat-address.util.ts`'in v2 kardeşi. İki sözleşme arasındaki asıl fark
 * burada görünür: v2 GÖNDERİCİYİ de ister, ili ADIYLA değil PLAKASIYLA alır ve
 * adı/soyadı ayrı zorunlu alanlar olarak bekler.
 *
 * Bu üç dönüşümün de başarısız olma ihtimali var, ve hepsi burada fail-closed:
 * çözülemeyen bir telefon ya da il, gönderiyi eksik bilgiyle açmak yerine
 * durdurur. Yanlış adrese açılmış fiziksel bir koli, hiç açılmamış bir
 * koliden pahalıdır — ikincisi düzeltilebilir, birincisi kaybolur.
 */

import { BadRequestException } from "@nestjs/common";
import { resolveTrPlateCode, splitPersonName } from "@tarodan/types";
import { i18nMessage } from "../../i18n";
import type { CargoParty } from "../helpers/cargo-provider";
import {
  SuratGonderiDurumu,
  SuratGonderiOlusturSekli,
  SuratKimOder,
  type SuratCreateShipmentInput,
  type SuratGonderiOlusturData,
  type SuratGonderiOlusturParty,
} from "../helpers/surat-cargo.types";
import {
  normalizeSuratLocation,
  normalizeSuratPhone,
} from "./surat-address.util";

/**
 * Kargo ücretini kim öder.
 *
 * Gönderici artık satıcı olsa da faturayı platform öder: escrow modeli kargoyu
 * ödeme anında alıcı+satıcı payı olarak zaten tahsil etmiş durumdadır
 * (docs/SHIPPING.md §5). `GondericiOder` seçmek Sürat faturasını satıcıya
 * çıkarır ve bu modeli bozar — bu yüzden env'e açılmıyor, sabit.
 */
const KIM_ODER = SuratKimOder.EntegrasyonFirmasiOder;

/** Tek koli gönderiyoruz: adet 1, kg 1 (v1'deki BirimKg sabitiyle aynı). */
const SINGLE_PARCEL_COUNT = 1;
const DEFAULT_KG = 1;

/** Hata mesajının hangi tarafı işaret ettiği — yanlış taraf yanlış yere baktırır. */
type PartyRole = "sender" | "recipient";

function buildParty(
  party: CargoParty,
  role: PartyRole,
  /**
   * `customerId` taşımayan taraf için müşteri anahtarı — pratikte gönderi
   * referansı (SatisKodu). Alan zorunlu olduğu için boş geçilemez, ama eksik
   * bir kod yüzünden koli açılmaması da doğru değil: bu alan teslimatı,
   * takibi ya da faturayı etkilemez, yalnız Sürat'ın cari eşleştirmesini
   * besler. Fail-closed davranış adres/telefon/il için geçerli — burası
   * bilinçli olarak fail-open.
   */
  fallbackCustomerId: string,
): SuratGonderiOlusturParty {
  const phone = normalizeSuratPhone(party.phone);
  if (!phone) {
    throw new BadRequestException(
      i18nMessage(
        role === "sender"
          ? "server.shipping.invalidSenderPhone"
          : "server.shipping.invalidRecipientPhone",
      ),
    );
  }

  const province = normalizeSuratLocation(party.city);
  const plateCode = resolveTrPlateCode(province);
  if (!plateCode) {
    throw new BadRequestException(
      i18nMessage("server.shipping.unknownProvince", { province }),
    );
  }

  const { firstName, lastName } = splitPersonName(party.name);

  return {
    // Sürat cari eşleştirmesi için alfanumerik bir değer bekliyor; dokümanı
    // telefonu örnek veriyor ve entegrasyon başlangıcında telefon gönderiyorduk.
    // Sürat telefon istemediğini bildirdi → kalıcı hesap referansı (adminCode)
    // ya da onun bulunmadığı yerde gönderi referansı. Telefon bu alana ARTIK
    // GİRMEMELİ; gerçekten gerektiği yer olan `Telefon` alanında zaten var.
    MusteriId: party.customerId?.trim() || fallbackCustomerId,
    Adi: firstName,
    Soyadi: lastName,
    Telefon: phone,
    Email: party.email ?? "",
    Adres: party.address.trim(),
    IlId: plateCode,
    IlceAdi: normalizeSuratLocation(party.district),
  };
}

/**
 * Tek bir `Data[]` elemanı üretir.
 *
 * İADE ayrı bir alan değil, yön farkıdır: v2'de `Iademi` bayrağı yoktur, çünkü
 * gönderen/alıcı zaten kimin geri gönderdiğini söyler. `input.isReturn` bu
 * yüzden tele hiç çıkmaz — yalnız kendi kayıtlarımızda yaşar.
 *
 * `content` (ürün başlığı) de tele çıkmaz: v1'in `SahisBirim` alanının v2'de
 * karşılığı yok, `Icerik` ise serbest metin değil parçalı gönderi kırılımı
 * ("desi:kg:tür:adet;") ve tek kolide boş bırakılır.
 */
export function buildGonderiOlusturData(
  input: SuratCreateShipmentInput,
): SuratGonderiOlusturData {
  const desi =
    Number.isFinite(input.desi) && Number(input.desi) > 0
      ? Number(input.desi)
      : 1;

  return {
    Desi: desi,
    Kg: DEFAULT_KG,
    Adet: SINGLE_PARCEL_COUNT,
    KimOder: KIM_ODER,
    SatisKodu: input.reference,
    Gonderen: buildParty(input.sender, "sender", input.reference),
    Alici: buildParty(input.recipient, "recipient", input.reference),
    GonderiDurumu: SuratGonderiDurumu.Kullanilmadi,
    GonderiSekli: SuratGonderiOlusturSekli.Standart,
    IsKapidanTahsilat: false,
    KapidaTahsilatTutari: 0,
  };
}
