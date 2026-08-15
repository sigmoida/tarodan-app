/** @format */

import type { LegalPart } from "@/components/legal/LegalDocument";
import {
  PLATFORM_ENTITY,
  PLATFORM_ENTITY_FIELDS,
} from "@/lib/legal/platform-entity";
import type { Translate } from "@/types/i18n";

/**
 * Platform Kullanım Koşulları — kayıt, listeleme, satış, satın alma, teklif ve
 * takas işlevlerinin mevcut çalışma biçimine göre hazırlanmıştır.
 *
 * Ödeme öncesinde sunulan işleme özel sözleşme ve bilgiler bu genel metni
 * tamamlar; tüketicinin emredici haklarını daraltan bir yorum yapılamaz.
 */
export const termsParts = (t: Translate): LegalPart[] => [
  {
    title: t("legal.terms.tarodanPlatformKullanimKosullari"),
    intro: t("legal.terms.buKullanimKosullariTarodanInternetSitesi"),
    sections: [
      {
        number: "1",
        heading: t("legal.terms.platformIsletmecisi"),
        blocks: [
          {
            type: "p",
            text: t("legal.terms.brandMarkaliElektronikTicaretPazarYeri", {
              brand: PLATFORM_ENTITY.brand,
              legalName: PLATFORM_ENTITY.legalName,
            }),
          },
          { type: "fields", items: PLATFORM_ENTITY_FIELDS(t) },
        ],
      },
      {
        number: "2",
        heading: t("legal.terms.kosullarinKabuluVeUygulanmasi"),
        blocks: [
          {
            type: "p",
            text: t("legal.terms.ziyaretciPlatformUKullandigindaUyeIse"),
          },
          {
            type: "note",
            text: t("legal.terms.buKosullarTuketicininKanundanDoganCayma"),
          },
        ],
      },
      {
        number: "3",
        heading: t("legal.terms.uyelikVeHesapGuvenligi"),
        blocks: [
          {
            type: "list",
            items: [
              {
                text: t("legal.terms.uyeHukukenBaglayiciIslemYapmaEhliyetine"),
              },
              {
                text: t("legal.terms.kayitVeDogrulamaSirasindaDogruGuncel"),
              },
              {
                text: t("legal.terms.sifreDogrulamaKoduVeOturumBilgileri"),
              },
              {
                text: t("legal.terms.birKisininBaskasiAdinaHesapAcmasi"),
              },
            ],
          },
        ],
      },
      {
        number: "4",
        heading: t("legal.terms.pazarYeriModeliVeSozlesmeninTaraflari"),
        blocks: [
          {
            type: "p",
            text: t("legal.terms.tarodanKuralOlarakAlicilarIleBagimsiz"),
          },
          {
            type: "p",
            text: t(
              "legal.terms.saticiTarafindanGirilenUrununOzgunluguMulkiyeti",
            ),
          },
        ],
      },
      {
        number: "5",
        heading: t("legal.terms.ilanVermeVeSaticininYukumlulukleri"),
        blocks: [
          {
            type: "list",
            items: [
              {
                text: t(
                  "legal.terms.saticiYalnizcaMulkiyetindeBulunanVeyaSatis",
                ),
              },
              {
                text: t("legal.terms.baslikFotografMarkaOlcekKondisyonEksik"),
              },
              {
                text: t("legal.terms.sahteTaklitCalintiMevzuataAykiriUcuncu"),
              },
              {
                text: t(
                  "legal.terms.saticiTamamlananSiparisiBelirtilenSuredeGuvenli",
                ),
              },
              {
                text: t("legal.terms.ticariVeyaMeslekiAmaclaSatisYapan"),
              },
            ],
          },
        ],
      },
      {
        number: "6",
        heading: t("legal.terms.satinAlmaTeklifVeTakas"),
        blocks: [
          {
            type: "p",
            text: t("legal.terms.aliciIslemiOnaylamadanOnceUrunAciklamasini"),
          },
          {
            type: "p",
            text: t("legal.terms.takastaHerTarafSunduguUrunlerBakimindan"),
          },
        ],
      },
      {
        number: "7",
        heading: t("legal.terms.fiyatlarKomisyonlarVeUcretliHizmetler"),
        blocks: [
          {
            type: "list",
            items: [
              {
                text: t(
                  "legal.terms.urunFiyatiSaticiTarafindanBelirlenirGecerli",
                ),
              },
              {
                text: t("legal.terms.aliciVeSaticiTarafindakiKomisyonHizmet"),
              },
              {
                text: t("legal.terms.kargoUcretiIlandaSecilenPaketBoyutu"),
              },
              {
                text: t("legal.terms.uyelikVeIlanOneCikarmaGibi"),
              },
              {
                text: t("legal.terms.onaylanmisBirIsleminKayitAltinaAlinan"),
              },
            ],
          },
        ],
      },
      {
        number: "8",
        heading: t("legal.terms.odemeHakedisVeIadeler"),
        blocks: [
          {
            type: "p",
            text: t("legal.terms.odemelerPlatformUnEntegreOdemeKurulusu"),
          },
          {
            type: "p",
            text: t("legal.terms.saticiHakedisiUrunBedeliGecerliKesinti"),
          },
        ],
      },
      {
        number: "9",
        heading: t("legal.terms.kargoTeslimatIadeVeUyusmazliklar"),
        blocks: [
          {
            type: "p",
            text: t("legal.terms.siparisVeTakasGonderileriKargoVe"),
          },
        ],
      },
      {
        number: "10",
        heading: t("legal.terms.kullaniciIcerikleriVeFikriHaklar"),
        blocks: [
          {
            type: "p",
            text: t("legal.terms.kullaniciPlatformAYukledigiFotografAciklama"),
          },
          {
            type: "p",
            text: t("legal.terms.tarodanMarkasiYazilimiTasarimiVeriTabani"),
          },
        ],
      },
      {
        number: "11",
        heading: t("legal.terms.yasaklananDavranislar"),
        blocks: [
          {
            type: "list",
            items: [
              {
                text: t(
                  "legal.terms.dolandiricilikYanilticiBeyanSahteIslemFiyat",
                ),
              },
              {
                text: t("legal.terms.taraflariPlatformDisiOdemeVeyaTeslimata"),
              },
              {
                text: t("legal.terms.hakaretTehditTacizNefretSoylemiKisisel"),
              },
              {
                text: t(
                  "legal.terms.zararliYazilimOtomatikSaldiriYetkisizErisim",
                ),
              },
              {
                text: t("legal.terms.fikriMulkiyetKisilikGizlilikVeyaTuketici"),
              },
            ],
          },
        ],
      },
      {
        number: "12",
        heading: t("legal.terms.icerikDenetimiVeHesapTedbirleri"),
        blocks: [
          {
            type: "p",
            text: t("legal.terms.tarodanBuKosullaraIslemeOzelKurallara"),
          },
          {
            type: "p",
            text: t(
              "legal.terms.kanunenBildirimYapilmasininSakincaliOlduguAcil",
            ),
          },
        ],
      },
      {
        number: "13",
        heading: t("legal.terms.hukukaAykiriIcerikVeHakIhlali"),
        blocks: [
          {
            type: "p",
            text: t("legal.terms.hukukaAykiriVeyaFikriMulkiyetHakkini"),
          },
        ],
      },
      {
        number: "14",
        heading: t("legal.terms.kisiselVerilerCerezlerVeIletisim"),
        blocks: [
          {
            type: "p",
            text: t(
              "legal.terms.kisiselVerilerinIslenmesiGizlilikPolitikasiVe",
            ),
          },
        ],
      },
      {
        number: "15",
        heading: t("legal.terms.hizmetinIsleyisiVeDegisiklikler"),
        blocks: [
          {
            type: "p",
            text: t("legal.terms.bakimGuvenlikMucbirSebepTasiyiciVeya"),
          },
          {
            type: "p",
            text: t("legal.terms.kosullarMevzuatIsModeliVeyaOzellik"),
          },
        ],
      },
      {
        number: "16",
        heading: t("legal.terms.sorumlulugunSinirlari"),
        blocks: [
          {
            type: "p",
            text: t("legal.terms.tarodanKendiKusuruVeyaKanundanDogan"),
          },
          {
            type: "p",
            text: t(
              "legal.terms.kullanicininYanlisBilgiVermesiHesabiniGuvensiz",
            ),
          },
        ],
      },
      {
        number: "17",
        heading: t("legal.terms.uyeliginSonaErmesi"),
        blocks: [
          {
            type: "p",
            text: t("legal.terms.uyeHesapAyarlariVeyaDestekKanali"),
          },
        ],
      },
      {
        number: "18",
        heading: t("legal.terms.uygulanacakHukukVeUyusmazlikCozumu"),
        blocks: [
          {
            type: "p",
            text: t("legal.terms.buKosullaraTurkHukukuUygulanirTuketiciler"),
          },
        ],
      },
      {
        number: "19",
        heading: t("legal.terms.iletisimVeElektronikKayitlar"),
        blocks: [
          {
            type: "p",
            text: t("legal.terms.kosullarVeyaBirIslemHakkindakiSorular", {
              email: PLATFORM_ENTITY.email,
              kep: PLATFORM_ENTITY.kep,
            }),
          },
        ],
      },
    ],
  },
];
