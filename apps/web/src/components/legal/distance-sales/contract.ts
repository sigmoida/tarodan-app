/** @format */

import type { LegalPart } from "@/components/legal/LegalDocument";
import type { Translate } from "@/types/i18n";
import { PLATFORM_ENTITY_FIELDS } from "@/lib/legal/platform-entity";

/**
 * Ön Bilgilendirme Formu ve Mesafeli Satış Sözleşmesi — metnin tek kaynağı.
 *
 * Belge PAZAR YERİ (aracı hizmet sağlayıcı) modeline göre yazılmıştır: satış
 * sözleşmesi kural olarak Satıcı ile Alıcı arasında kurulur, Platform aracılık
 * eder. Platform'un kendi ürününü sattığı işlemler ürün sayfasında ayrıca
 * belirtilir.
 *
 * Siparişe özel alanlar (ürün, tutar, taraf bilgileri) burada boş bırakılır ve
 * `fields` bloğuyla "siparişinizde belirtilir" olarak gösterilir: bu sayfa genel
 * sözleşme metnidir, sipariş bağlamı yoktur. Somut değerler sipariş özeti
 * ekranında ve sipariş onay e-postasında yer alır.
 */

const BUYER_FIELDS = (t: Translate) => [
  { label: t("legal.distanceSales.adSoyadUnvan") },
  { label: t("legal.distanceSales.teslimatAdresi") },
  { label: t("legal.distanceSales.telefon") },
  { label: t("legal.distanceSales.ePosta") },
];

const SELLER_FIELDS = (t: Translate) => [
  { label: t("legal.distanceSales.unvanAdSoyad") },
  { label: t("legal.distanceSales.mersisVergiNo") },
  { label: t("legal.distanceSales.adres") },
  { label: t("legal.distanceSales.telefonEPostaKep") },
];

/** A) ÖN BİLGİLENDİRME FORMU */
const PRE_INFORMATION = (t: Translate): LegalPart => ({
  title: t("legal.distanceSales.aOnBilgilendirmeFormuMesafeliSozlesme"),
  intro: t("legal.distanceSales.isbuOnBilgilendirmeFormuHttpsTarodan"),
  sections: [
    {
      number: "1",
      heading: t("legal.distanceSales.tarafBilgileriSaticiAliciPlatformUn"),
      blocks: [
        {
          type: "fields",
          intro: t("legal.distanceSales.aliciTuketici"),
          items: BUYER_FIELDS(t),
        },
        {
          type: "fields",
          intro: t("legal.distanceSales.saticiSozlesmeninSaticiTarafi"),
          items: SELLER_FIELDS(t),
        },
        {
          type: "fields",
          intro: t("legal.distanceSales.platformAraciHizmetSaglayici"),
          items: PLATFORM_ENTITY_FIELDS(t),
        },
        {
          type: "note",
          text: t(
            "legal.distanceSales.buSiparisKapsamindakiMesafeliSatisSozlesmesi",
          ),
        },
        {
          type: "p",
          text: t("legal.distanceSales.buFormunAmaciSiparisiOnaylamadanOnce"),
        },
      ],
    },
    {
      number: "2",
      heading: t(
        "legal.distanceSales.sozlesmeKonusuMalHizmetinTemelNitelikleri",
      ),
      blocks: [
        {
          type: "fields",
          intro: t(
            "legal.distanceSales.asagidakiBilgilerSiparisinizeOzeldirSiparisOzeti",
          ),
          items: [
            { label: t("legal.distanceSales.urunHizmetAdi") },
            { label: t("legal.distanceSales.markaModel") },
            {
              label: t("legal.distanceSales.kullanimDurumuSifirIkinciElOutlet"),
            },
            { label: t("legal.distanceSales.renkBedenOlcuVbOzellikler") },
            { label: t("legal.distanceSales.adet") },
            {
              label: t(
                "legal.distanceSales.temelOzelliklerVeAmbalajIcerikBilgisi",
              ),
            },
          ],
        },
        {
          type: "p",
          text: t(
            "legal.distanceSales.aliciUrununTemelNitelikleriniVeGorsellerini",
          ),
        },
      ],
    },
    {
      number: "3",
      heading: t("legal.distanceSales.toplamFiyatVergilerVeEkMasraflar"),
      blocks: [
        {
          type: "fields",
          intro: t(
            "legal.distanceSales.odenecekToplamTutarinKalemleriSiparisOzeti",
          ),
          items: [
            { label: t("legal.distanceSales.urunBedeliKdvDahil") },
            {
              label: t(
                "legal.distanceSales.teslimatKargoUcretiOdeyecekTarafBelirtilir",
              ),
            },
            { label: t("legal.distanceSales.varsaKapidaOdemeIslemUcreti") },
            {
              label: t(
                "legal.distanceSales.varsaPlatformKorumaHizmetBedeliAraci",
              ),
            },
            { label: t("legal.distanceSales.varsaIndirimKuponKampanya") },
            { label: t("legal.distanceSales.odenecekToplamTutar") },
          ],
        },
        {
          type: "note",
          text: t(
            "legal.distanceSales.aliciSiparisiOnaylaOdemeyiTamamlaButonuna",
          ),
        },
      ],
    },
    {
      number: "4",
      heading: t("legal.distanceSales.odemeTeslimatVeIfaKosullari"),
      blocks: [
        {
          type: "fields",
          items: [
            {
              label: t("legal.distanceSales.odemeYontemiKrediKartiBankaKarti"),
            },
            { label: t("legal.distanceSales.teslimatAdresi") },
            { label: t("legal.distanceSales.tahminiTeslimSuresi") },
            {
              label: t(
                "legal.distanceSales.teslimatOrganizasyonuSaticiGonderirEntegrasyonluKargo",
              ),
            },
          ],
        },
        {
          type: "p",
          text: t(
            "legal.distanceSales.saticiMevzuattaOngorulenAzamiSurelerSakli",
          ),
        },
        {
          type: "p",
          text: t(
            "legal.distanceSales.siparisinKesinlesmesiOdemeninTamVeEksiksiz",
          ),
        },
      ],
    },
    {
      number: "5",
      heading: t("legal.distanceSales.caymaHakki14GunKapsamSure"),
      blocks: [
        {
          type: "p",
          text: t("legal.distanceSales.aliciTeslimdenItibaren14OnDort"),
        },
        {
          type: "list",
          items: [
            {
              text: t(
                "legal.distanceSales.aliciCaymaBildiriminiHesabimSiparislerimIade",
              ),
            },
            {
              text: t("legal.distanceSales.aliciNinUrunuIadeIcinGondermesi"),
            },
            {
              text: t("legal.distanceSales.caymaHalindeIadeKargoBedelininKim"),
            },
          ],
        },
        {
          type: "p",
          text: t(
            "legal.distanceSales.caymaHakkiIstisnalariHijyenSaglikNedeniyle",
          ),
        },
        {
          type: "note",
          text: t("legal.distanceSales.ticariAlicilarinTacirlerinVeSaticiNin"),
        },
      ],
    },
    {
      number: "6",
      heading: t("legal.distanceSales.iadeDegisimAyipliMalVeSatici"),
      blocks: [
        {
          type: "p",
          text: t(
            "legal.distanceSales.caymaHakkindanBagimsizOlarakUrununAyipli",
          ),
        },
        {
          type: "p",
          text: t("legal.distanceSales.aliciNinAyipIddiasinaIliskinFotograf"),
        },
      ],
    },
    {
      number: "7",
      heading: t("legal.distanceSales.sikayetTalepVeUyusmazlikCozumu"),
      blocks: [
        {
          type: "list",
          items: [
            {
              label: t("legal.distanceSales.platform"),
              text: t(
                "legal.distanceSales.destekMerkeziUzerindenTalepAcarakDestek",
              ),
            },
            {
              label: t("legal.distanceSales.satici"),
              text: t("legal.distanceSales.urunVeSiparisSayfasindaYerAlan"),
            },
          ],
        },
        {
          type: "p",
          text: t(
            "legal.distanceSales.uyusmazliklardaTuketiciParasalSinirlarDahilindeTuketici",
          ),
        },
      ],
    },
    {
      number: "8",
      heading: t("legal.distanceSales.onBilgilendirmeOnayiVeKaliciVeri"),
      blocks: [
        {
          type: "p",
          text: t("legal.distanceSales.aliciSiparisiOnaylamadanOnceBuOn"),
        },
        {
          type: "p",
          text: t(
            "legal.distanceSales.onBilgilendirmeVeMesafeliSatisSozlesmesi",
          ),
        },
        {
          type: "note",
          text: t("legal.distanceSales.onayKutucuguMetniOnBilgilendirmeFormu"),
        },
      ],
    },
  ],
});

/** B) MESAFELİ SATIŞ SÖZLEŞMESİ */
const SALES_CONTRACT = (t: Translate): LegalPart => ({
  title: t("legal.distanceSales.bMesafeliSatisSozlesmesi"),
  sections: [
    {
      number: "1",
      heading: t("legal.distanceSales.taraflarTanimlarVeSozlesmeninKurulmasi"),
      blocks: [
        {
          type: "p",
          text: t(
            "legal.distanceSales.isbuMesafeliSatisSozlesmesiTarodanUzerinden",
          ),
        },
        {
          type: "fields",
          intro: t("legal.distanceSales.aliciTuketici"),
          items: BUYER_FIELDS(t),
        },
        {
          type: "fields",
          intro: t("legal.distanceSales.satici2"),
          items: SELLER_FIELDS(t),
        },
        {
          type: "fields",
          intro: t("legal.distanceSales.platformAraciHizmetSaglayici"),
          items: PLATFORM_ENTITY_FIELDS(t),
        },
        {
          type: "p",
          text: t("legal.distanceSales.sozlesmeNinKonusuNitelikleriVeSatis"),
        },
        {
          type: "note",
          text: t("legal.distanceSales.platformKuralOlarakBuSozlesmeNin"),
        },
      ],
    },
    {
      number: "2",
      heading: t("legal.distanceSales.sozlesmeKonusuUrunHizmetBilgileri"),
      blocks: [
        {
          type: "fields",
          intro: t(
            "legal.distanceSales.asagidakiBilgilerSiparisinizeOzeldirVeSiparis",
          ),
          items: [
            { label: t("legal.distanceSales.urunHizmet") },
            { label: t("legal.distanceSales.adet") },
            { label: t("legal.distanceSales.birimFiyatKdvDahil") },
            { label: t("legal.distanceSales.araToplam") },
            {
              label: t(
                "legal.distanceSales.teslimatKargoOdeyecekTarafBelirtilir",
              ),
            },
            { label: t("legal.distanceSales.varsaHizmetBedeliKomisyon") },
            { label: t("legal.distanceSales.indirimKupon") },
            { label: t("legal.distanceSales.toplam") },
            { label: t("legal.distanceSales.teslimatAdresi") },
            {
              label: t("legal.distanceSales.faturaBilgisiAdUnvanVergiBilgisi"),
            },
          ],
        },
      ],
    },
    {
      number: "3",
      heading: t("legal.distanceSales.odemeTeslimatVeIfa"),
      blocks: [
        {
          type: "p",
          text: t("legal.distanceSales.odemeYontemiVeOdemeninNeZaman"),
        },
        {
          type: "p",
          text: t(
            "legal.distanceSales.saticiSiparisinKendisineUlastigiAndanItibaren",
          ),
        },
        {
          type: "p",
          text: t("legal.distanceSales.teslimAnindaKargoPaketiHasarliysaAlici"),
        },
      ],
    },
    {
      number: "4",
      heading: t("legal.distanceSales.caymaHakkiVeKullanimi14Gun"),
      blocks: [
        {
          type: "p",
          text: t("legal.distanceSales.aliciUrunuTeslimAldigiTarihtenItibaren"),
        },
        {
          type: "list",
          items: [
            {
              text: t(
                "legal.distanceSales.iadeEdilecekUrunKullanilmamisTekrarSatilabilirligini",
              ),
            },
            {
              text: t(
                "legal.distanceSales.iadeSurecindeUrununHangiKargoFirmasiyla",
              ),
            },
            {
              text: t(
                "legal.distanceSales.iadeMasraflarininKimTarafindanKarsilanacaginaIliskin",
              ),
            },
          ],
        },
        {
          type: "p",
          text: t("legal.distanceSales.caymaHakkiKapsamiDisindaKalanUrun"),
        },
      ],
    },
    {
      number: "5",
      heading: t("legal.distanceSales.ayipliMalEksikYanlisGonderimHasarli"),
      blocks: [
        {
          type: "p",
          text: t(
            "legal.distanceSales.urununAyipliCikmasiEksikYanlisGonderilmesi",
          ),
        },
        {
          type: "list",
          items: [
            {
              text: t("legal.distanceSales.platformAliciNinTalebiniSaticiYa"),
            },
            { text: t("legal.distanceSales.talepVeSikayetKayitlariniTutar") },
            {
              text: t(
                "legal.distanceSales.tuketiciyeSurecTakibiSaglayanSistemiAcik",
              ),
            },
          ],
        },
        {
          type: "p",
          text: t(
            "legal.distanceSales.platformTuketiciMagduriyetiniGidermekAdinaUyusmazlik",
          ),
        },
        {
          type: "p",
          text: t("legal.distanceSales.aliciNinAyipIddiasinaIliskinDelilleri"),
        },
      ],
    },
    {
      number: "6",
      heading: t("legal.distanceSales.iletisimSikayetVeUyusmazliklar"),
      blocks: [
        {
          type: "p",
          text: t("legal.distanceSales.aliciPlatformUnDestekMerkeziUzerinden"),
        },
        {
          type: "note",
          text: t("legal.distanceSales.asagidaki6167MaddeleriPlatform"),
        },
      ],
    },
    {
      number: "6.1",
      heading: t("legal.distanceSales.rucuMahsupVeEmanetOdemeEscrow"),
      blocks: [
        {
          type: "p",
          text: t(
            "legal.distanceSales.platformTuketicininCaymaHakkiniKullanmasiAyipli",
          ),
        },
      ],
    },
    {
      number: "6.2",
      heading: t("legal.distanceSales.delilSozlesmesi"),
      blocks: [
        {
          type: "p",
          text: t(
            "legal.distanceSales.taraflarAralarindakiUyusmazliklardaPlatformUnVeri",
          ),
        },
      ],
    },
    {
      number: "6.3",
      heading: t("legal.distanceSales.cezaiSartTicariSaticilarIcin"),
      blocks: [
        {
          type: "p",
          text: t("legal.distanceSales.saticiNinSahteYanilticiUrunGondermesi"),
        },
      ],
    },
    {
      number: "6.4",
      heading: t("legal.distanceSales.komisyonVeHizmetBedelleri"),
      blocks: [
        {
          type: "p",
          text: t(
            "legal.distanceSales.platformPiyasaKosullariniGozeterekKomisyonOranlarinda",
          ),
        },
      ],
    },
    {
      number: "6.5",
      heading: t("legal.distanceSales.rekabetVeFiyatlandirma"),
      blocks: [
        {
          type: "p",
          text: t(
            "legal.distanceSales.platformunSunduguOtomatikFiyatlandirmaAraclariSaticilar",
          ),
        },
      ],
    },
    {
      number: "6.6",
      heading: t("legal.distanceSales.iysVeVeriUyumu"),
      blocks: [
        {
          type: "p",
          text: t("legal.distanceSales.saticiIletiYonetimSistemiIysMevzuatina"),
        },
      ],
    },
    {
      number: "6.7",
      heading: t("legal.distanceSales.maneviTazminatSiniri"),
      blocks: [
        {
          type: "p",
          text: t(
            "legal.distanceSales.sozlesmeninIfaEdilmemesiVeyaGecikmesiHallerinde",
          ),
        },
      ],
    },
    {
      number: "7",
      heading: t("legal.distanceSales.kisiselVeriler"),
      blocks: [
        {
          type: "p",
          text: t("legal.distanceSales.aliciNinKisiselVerileriUyelikSiparis"),
        },
        {
          type: "p",
          text: t(
            "legal.distanceSales.saticiAliciVerileriniYalnizcaSiparisinIfasi",
          ),
        },
      ],
    },
    {
      number: "8",
      heading: t("legal.distanceSales.yururlukVeErisim"),
      blocks: [
        {
          type: "p",
          text: t(
            "legal.distanceSales.buSozlesmeSiparisinAliciTarafindanElektronik",
          ),
        },
        {
          type: "note",
          text: t(
            "legal.distanceSales.onayKutucuguMetniMesafeliSatisSozlesmesi",
          ),
        },
      ],
    },
  ],
});

export const distanceSalesParts = (t: Translate): LegalPart[] => [
  PRE_INFORMATION(t),
  SALES_CONTRACT(t),
];
