/** @format */
import type { Translate } from "@/types/i18n";

/**
 * İade ve iptal koşulları — kurumsal metnin tek kaynağı.
 *
 * Yapı bilinçli olarak soru-cevap: sayfa metin ağırlıklı, her madde bir başlık
 * ve altındaki paragraf/liste. Etiketli maddelerde (`label`) etiket kalın
 * basılır, böylece "hangi durumda kim öder" tablosu okunur kalır.
 */

export interface PolicyBullet {
  /** Kalın basılacak durum adı (örn. "Teslimat Tarihi Gecikti"). */
  label?: string;
  text: string;
}

export interface PolicyEntry {
  q: string;
  /** Listeden önce gelen açıklama. */
  a?: string;
  bullets?: PolicyBullet[];
  /** Listeden sonra gelen kapanış cümlesi. */
  note?: string;
}

export const returnPolicy = (t: Translate): PolicyEntry[] => [
  {
    q: t("legal.refundPolicy.hangiKosullardaIadeTalebiOlusturulabilir"),
    a: t(
      "legal.refundPolicy.koleksiyonunuzaEklediginizModelAracinIlandakiTanimlara",
    ),
    bullets: [
      { text: t("legal.refundPolicy.urununTanimaVeGorseleUymamasi") },
      {
        text: t(
          "legal.refundPolicy.ilandaBelirtilmemisKusurVeyaHasarBulunmasi",
        ),
      },
      { text: t("legal.refundPolicy.eksikUrunVeyaParcaGonderilmesi") },
      { text: t("legal.refundPolicy.sahteUrunVeyaParcaTespiti") },
      { text: t("legal.refundPolicy.calismayanVeyaArizaliUrunCikmasi") },
      {
        text: t(
          "legal.refundPolicy.alicininCaymaHakkiniKullanarakVazgectimDemesi",
        ),
      },
      { text: t("legal.refundPolicy.kullaniciKaynakliHasarDurumlari") },
    ],
  },
  {
    q: t("legal.refundPolicy.neZamanIadeTalebiOlusturabilirim"),
    a: t("legal.refundPolicy.kargonuzuTeslimAldiginizAndanItibarenYasal"),
  },
  {
    q: t("legal.refundPolicy.iadeTalebiNasilOlusturulur"),
    a: t(
      "legal.refundPolicy.tarodanUygulamasiniAcarakHesabimSiparislerimAdimlarini",
    ),
  },
  {
    q: t("legal.refundPolicy.iadeTalebiNasilDegerlendirilir"),
    a: t("legal.refundPolicy.olusturdugunuzIadeTalebiVeBelirttiginizGerekce"),
  },
  {
    q: t("legal.refundPolicy.iadeTalebiNeKadarSuredeSonuclanir"),
    a: t("legal.refundPolicy.iadeTalebinizSistemeUlastigiAndanItibaren"),
  },
  {
    q: t("legal.refundPolicy.iadeTalebiKabulEdilenAliciNe"),
    a: t("legal.refundPolicy.iadeTalebinizOnaylandigindaSistemTarafindanSize"),
  },
  {
    q: t("legal.refundPolicy.iadeGonderimiIcinOdemeYapmamGerekiyor"),
    a: t("legal.refundPolicy.iadeKargoUcretininKiminTarafindanOdenecegi"),
    bullets: [
      {
        label: t("legal.refundPolicy.tanimaUymayanKusurluEksikSahteVeya"),
        text: t(
          "legal.refundPolicy.iadelerindeKargoBedeliSaticiTarafindanOdenir",
        ),
      },
      {
        label: t("legal.refundPolicy.vazgectimVeyaKullaniciKaynakliHasar"),
        text: t("legal.refundPolicy.durumlarindaIseKargoGonderimUcretiAliciya"),
      },
    ],
  },
  {
    q: t("legal.refundPolicy.iadeEdilenSiparisinUcretIadesiNe"),
    a: t("legal.refundPolicy.iadeEdilenUrunMerkezeUlastiktanVe"),
  },
  {
    q: t("legal.refundPolicy.iadeEdilenTutarNedenDahaDusuk"),
    a: t(
      "legal.refundPolicy.iadeOnaylandigindaYapilanKesintilerIadeninSebebine",
    ),
    bullets: [
      {
        label: t("legal.refundPolicy.tanimaUymayanKusurluEksikSahteArizali"),
        text: t("legal.refundPolicy.buHakliDurumlardaKargoMasrafiniSatici"),
      },
      {
        label: t("legal.refundPolicy.kullaniciKaynakliHasarVazgectimDurumlari"),
        text: t("legal.refundPolicy.buDurumlardaIadeKargoUcretiniAlici"),
      },
    ],
  },
];

export const cancellationPolicy = (t: Translate): PolicyEntry[] => [
  {
    q: t("legal.refundPolicy.hangiKosullardaIptalTalebiOlusturulabilir"),
    a: t("legal.refundPolicy.siparisiniziVerdiktenSonraUrunHenuzKargoya"),
    bullets: [
      { text: t("legal.refundPolicy.teslimatTarihiGecikti") },
      { text: t("legal.refundPolicy.yanlisUrunSectim") },
      { text: t("legal.refundPolicy.vazgectim") },
      { text: t("legal.refundPolicy.yanlisKartlaOdemeYaptim") },
      { text: t("legal.refundPolicy.fiyatNedeniyleVazgectim") },
      { text: t("legal.refundPolicy.adresteBulunamayacagim") },
    ],
  },
  {
    q: t("legal.refundPolicy.neZamanIptalTalebiOlusturabilirim"),
    a: t("legal.refundPolicy.siparisiniziVerdiktenSonraUrununuzHenuzKargoya"),
  },
  {
    q: t("legal.refundPolicy.iptalTalebiNasilOlusturulur"),
    a: t(
      "legal.refundPolicy.tarodanUygulamasiniAcarakHesabimSiparislerimAdimlarini2",
    ),
  },
  {
    q: t("legal.refundPolicy.iptalTalebiNasilDegerlendirilir"),
    a: t("legal.refundPolicy.olusturdugunuzIptalTalebiUrununOAnki"),
  },
  {
    q: t("legal.refundPolicy.iptalTalebiNeKadarSuredeSonuclanir"),
    a: t("legal.refundPolicy.iptalTalebinizSistemeUlastigiAndanItibaren"),
  },
  {
    q: t("legal.refundPolicy.iptalTalebiKabulEdilenAliciNe"),
    a: t("legal.refundPolicy.egerIptalEdilenUrunKargoyaVerilmisse"),
  },
  {
    q: t("legal.refundPolicy.iptalGonderimiIcinOdemeYapmamGerekiyor"),
    a: t("legal.refundPolicy.iptalNedeninizeVeUrununDurumunaGore"),
    bullets: [
      {
        label: t("legal.refundPolicy.teslimatTarihiGecikti"),
        text: t("legal.refundPolicy.kargoUcretiniSaticiOder"),
      },
      {
        label: t("legal.refundPolicy.yanlisUrunSectimVazgectimYanlisKartla"),
        text: t("legal.refundPolicy.urunKargoyaVerildiyseKargoUcretiniAlici"),
      },
    ],
  },
  {
    q: t("legal.refundPolicy.iptalEdilenSiparisinUcretIadesiNe"),
    a: t("legal.refundPolicy.iptalIsleminizOnaylandigindaVeyaKargodakiUrun"),
  },
  {
    q: t("legal.refundPolicy.iptalEdilenUrundeTutarNedenDaha"),
    a: t("legal.refundPolicy.iptalEdilenSiparislerdeTutarinBirKisminin"),
    bullets: [
      {
        label: t("legal.refundPolicy.teslimatTarihiGecikti"),
        text: t("legal.refundPolicy.buDurumdaTumMasraflarSaticiyaAittir"),
      },
      {
        label: t("legal.refundPolicy.yanlisUrunSectimVazgectimYanlisKartla"),
        text: t("legal.refundPolicy.urunKargoyaVerildiyseKargoUcretiAlicidan"),
      },
    ],
  },
];
