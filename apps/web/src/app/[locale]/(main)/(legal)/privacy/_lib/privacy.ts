/** @format */

import type { LegalPart } from "@/components/legal/LegalDocument";
import { PLATFORM_ENTITY } from "@/lib/legal/platform-entity";
import type { Translate } from "@/types/i18n";

/**
 * KVKK Aydınlatma Metni (6698 sayılı Kanun m.10) — metnin tek kaynağı.
 *
 * Veri sorumlusu künyesi `platform-entity.ts`ten gelir: aynı tüzel kişi mesafeli
 * satış sözleşmesinde de geçiyor ve başvuru adresi iki belgede ayrışmamalı.
 *
 * Çerezlere ilişkin ayrıntılı metin ayrı bir sayfada (Çerez Politikası) yayımlanır;
 * burada yalnızca çerez verilerinin hangi kategoride işlendiği belirtilir.
 */
export const privacyParts = (t: Translate): LegalPart[] => [
  {
    title: t("legal.privacy.kisiselVerilerinKorunmasinaIliskinAydinlatmaMetni"),
    intro: t("legal.privacy.isbuAydinlatmaMetni6698SayiliKisisel"),
    sections: [
      {
        number: "1",
        heading: t("legal.privacy.veriSorumlusu"),
        blocks: [
          {
            type: "p",
            text: t("legal.privacy.legalnameSirketAddressAdresindeMukimOlup", {
              legalName: PLATFORM_ENTITY.legalName,
              address: PLATFORM_ENTITY.address,
              website: PLATFORM_ENTITY.website,
            }),
          },
          {
            type: "fields",
            items: [
              {
                label: t("legal.privacy.unvan"),
                value: PLATFORM_ENTITY.legalName,
              },
              {
                label: t("legal.privacy.adres"),
                value: PLATFORM_ENTITY.address,
              },
              {
                label: t("legal.privacy.ePosta"),
                value: PLATFORM_ENTITY.email,
              },
              { label: t("legal.privacy.kep"), value: PLATFORM_ENTITY.kep },
            ],
          },
        ],
      },
      {
        number: "2",
        heading: t("legal.privacy.kisiselVeriNedir"),
        blocks: [
          {
            type: "p",
            text: t(
              "legal.privacy.kisiselVeriKimligiBelirliVeyaBelirlenebilir",
            ),
          },
        ],
      },
      {
        number: "3",
        heading: t("legal.privacy.ilgiliKisiGruplariVeIslenenVeri"),
        blocks: [
          {
            type: "groups",
            groups: [
              {
                title: t("legal.privacy.aZiyaretci"),
                items: [
                  t("legal.privacy.islemGuvenligiIpLogCerezKayitlari"),
                  t("legal.privacy.pazarlamaRizaVarsaReklamSegmentasyonCerez"),
                ],
              },
              {
                title: t("legal.privacy.bUyeAlici"),
                items: [
                  t("legal.privacy.kimlikAdSoyadKullaniciAdiTckn"),
                  t("legal.privacy.iletisimEPostaTelefonAdres"),
                  t("legal.privacy.musteriIslemSiparisOdemeFaturaTeslimat"),
                  t("legal.privacy.islemGuvenligiIpLogGirisKayitlari"),
                  t("legal.privacy.hukukiIslemUyusmazlikBasvuruKayitlari"),
                  t("legal.privacy.isitselKayitCagriMerkeziVarsaSes"),
                ],
              },
              {
                title: t("legal.privacy.cUyeSaticiBireyselVeyaTicari"),
                items: [
                  t("legal.privacy.kimlikYetkiliAdSoyadKimlikDogrulama"),
                  t("legal.privacy.finansIbanHakedisKomisyonMahsupRaporlari"),
                  t("legal.privacy.musteriIslemUrunListelemeSiparisIade"),
                  t(
                    "legal.privacy.hukukiIslemSozlesmeIhlaliUyusmazlikKayitlari",
                  ),
                  t("legal.privacy.islemGuvenligiIpLogPanelErisim"),
                ],
              },
            ],
          },
        ],
      },
      {
        number: "4",
        heading: t("legal.privacy.kisiselVerilerinIslenmeAmaclari"),
        blocks: [
          {
            type: "p",
            text: t(
              "legal.privacy.kisiselVerilerBastaAsagidakiAmaclarlaIslenir",
            ),
          },
          {
            type: "list",
            items: [
              { text: t("legal.privacy.uyelikKaydiVeHesapYonetimi") },
              {
                text: t(
                  "legal.privacy.mesafeliSatisSureclerininYurutulmesiSiparisOdeme",
                ),
              },
              { text: t("legal.privacy.musteriDestekSikayetYonetimi") },
              { text: t("legal.privacy.bilgiGuvenligiVeSuistimalFraudOnleme") },
              {
                text: t(
                  "legal.privacy.hukukiYukumluluklerinYerineGetirilmesiVeUyusmazliklarin",
                ),
              },
              {
                text: t(
                  "legal.privacy.finansMuhasebeFaturalandirmaVeRaporlama",
                ),
              },
              {
                text: t("legal.privacy.acikRizaVarsaPazarlamaKampanyaVe"),
              },
            ],
          },
        ],
      },
      {
        number: "5",
        heading: t("legal.privacy.toplamaYontemiVeHukukiSebep"),
        blocks: [
          {
            type: "p",
            text: t(
              "legal.privacy.verilerPlatformUzerindenElektronikOrtamdaOtomatik",
            ),
          },
          {
            type: "p",
            text: t("legal.privacy.hukukiSebeplerSomutIslemeFaaliyetineGore"),
          },
        ],
      },
      {
        number: "6",
        heading: t("legal.privacy.kisiselVerilerinAktarimiYurtIciYurt"),
        blocks: [
          {
            type: "p",
            text: t(
              "legal.privacy.kisiselVerilerIslemeAmaclariylaSinirliOlarak",
            ),
          },
          {
            type: "list",
            items: [
              {
                text: t("legal.privacy.odemeHizmetSaglayicilarinaVeBankalara"),
              },
              { text: t("legal.privacy.kargoLojistikFirmalarina") },
              {
                text: t(
                  "legal.privacy.bilgiTeknolojileriAltyapiSaglayicilarinaHostingE",
                ),
              },
              {
                text: t(
                  "legal.privacy.hukukDenetimVeMaliMusavirlikDanismanlarina",
                ),
              },
              { text: t("legal.privacy.yetkiliKamuKurumVeKuruluslarina") },
            ],
          },
          {
            type: "p",
            text: t("legal.privacy.yurtDisinaAktarimSozKonusuIse"),
          },
        ],
      },
      {
        number: "7",
        heading: t("legal.privacy.ilgiliKisininHaklariKvkkM11"),
        blocks: [
          {
            type: "p",
            text: t(
              "legal.privacy.ilgiliKisilerKisiselVerilerininIslenipIslenmedigini",
            ),
          },
        ],
      },
      {
        number: "8",
        heading: t("legal.privacy.basvuruYontemi"),
        blocks: [
          {
            type: "p",
            text: t("legal.privacy.kvkkKapsamindakiTaleplerKepEmailVeya", {
              kep: PLATFORM_ENTITY.kep,
              email: PLATFORM_ENTITY.email,
              address: PLATFORM_ENTITY.address,
            }),
          },
          {
            type: "note",
            text: t("legal.privacy.basvurularEnGec30GunIcinde"),
          },
        ],
      },
    ],
  },
];
