/** @format */

import type { LegalPart } from "@/components/legal/LegalDocument";
import { PLATFORM_ENTITY_FIELDS } from "@/lib/legal/platform-entity";
import type { Translate } from "@/types/i18n";

/**
 * Tarodan kargo ve teslimat politikasının tek içerik kaynağı.
 *
 * Operasyonel süre veya taşıyıcı değiştiğinde bu metin de güncellenmelidir.
 * Tutarlar özellikle sabit yazılmaz: kullanıcı için bağlayıcı olan tutar, aktif
 * kargo tarifesi ve ilanda seçilen paket boyutuyla ödeme adımında hesaplanır.
 */
export const shippingDeliveryParts = (t: Translate): LegalPart[] => [
  {
    title: t("information.shippingDelivery.kargoVeTeslimatPolitikasi"),
    intro: t(
      "information.shippingDelivery.buPolitikaTarodanUzerindenVerilenSiparislerde",
    ),
    sections: [
      {
        number: "1",
        heading: t("information.shippingDelivery.kapsamVeTaraflarinRolu"),
        blocks: [
          {
            type: "p",
            text: t(
              "information.shippingDelivery.tarodanUcuncuTarafAliciVeSaticilari",
            ),
          },
          {
            type: "fields",
            intro: t(
              "information.shippingDelivery.platformIsletmecisiVeDestekKanallari",
            ),
            items: PLATFORM_ENTITY_FIELDS(t),
          },
        ],
      },
      {
        number: "2",
        heading: t("information.shippingDelivery.kargoUcretininHesaplanmasi"),
        blocks: [
          {
            type: "list",
            items: [
              {
                label: t("information.shippingDelivery.paketBoyutu"),
                text: t(
                  "information.shippingDelivery.saticiIlaniOlustururkenUrununGonderimineUygun",
                ),
              },
              {
                label: t("information.shippingDelivery.aktifTarife"),
                text: t(
                  "information.shippingDelivery.kargoUcretiOdemeAnindaYururlukteOlan",
                ),
              },
              {
                label: t("information.shippingDelivery.birdenFazlaSatici"),
                text: t(
                  "information.shippingDelivery.ayniOdemeIcindeFarkliSaticilardanUrun",
                ),
              },
              {
                label: t("information.shippingDelivery.yanlisPaketBilgisi"),
                text: t(
                  "information.shippingDelivery.saticiUrununGuvenliTasinmasinaVeGercek",
                ),
              },
            ],
          },
          {
            type: "note",
            text: t(
              "information.shippingDelivery.kargoIcinGecerliTutarOdemeVeya",
            ),
          },
        ],
      },
      {
        number: "3",
        heading: t(
          "information.shippingDelivery.siparisinHazirlanmasiVeKargoyaVerilmesi",
        ),
        blocks: [
          {
            type: "p",
            text: t(
              "information.shippingDelivery.odemeOnaylandigindaSaticiIcinSiparisDetayinda",
            ),
          },
          {
            type: "p",
            text: t(
              "information.shippingDelivery.hazirlamaSuresiDolduguHaldeTasiyiciKayitlarinda",
            ),
          },
        ],
      },
      {
        number: "4",
        heading: t(
          "information.shippingDelivery.tasiyiciTakipVeTahminiTeslimSuresi",
        ),
        blocks: [
          {
            type: "p",
            text: t(
              "information.shippingDelivery.tarodanInMevcutEntegreTasiyicisiSurat",
            ),
          },
          {
            type: "list",
            items: [
              {
                text: t(
                  "information.shippingDelivery.teslimatSuresiAdresinBulunduguIlIlce",
                ),
              },
              {
                text: t(
                  "information.shippingDelivery.adresVeIletisimBilgilerininDogruVe",
                ),
              },
              {
                text: t(
                  "information.shippingDelivery.takipEkranindakiTasiyiciVerisiGecikmeliGuncellenebilir",
                ),
              },
            ],
          },
        ],
      },
      {
        number: "5",
        heading: t("information.shippingDelivery.teslimatVeHasarKontrolu"),
        blocks: [
          {
            type: "p",
            text: t(
              "information.shippingDelivery.teslimatAliciyaVeyaAlicininBelirledigiUcuncu",
            ),
          },
          {
            type: "p",
            text: t(
              "information.shippingDelivery.paketTeslimAlinirkenDisAmbalajinVe",
            ),
          },
        ],
      },
      {
        number: "6",
        heading: t(
          "information.shippingDelivery.gecikmeImkansizlasmaVeUcretIadesi",
        ),
        blocks: [
          {
            type: "p",
            text: t(
              "information.shippingDelivery.tuketiciIslemlerindeSaticiAyricaDahaKisa",
            ),
          },
          {
            type: "p",
            text: t(
              "information.shippingDelivery.iptalVeyaIadeOnaylandigindaOdemeKullanilan",
            ),
          },
        ],
      },
      {
        number: "7",
        heading: t("information.shippingDelivery.caymaVeIadeGonderileri"),
        blocks: [
          {
            type: "p",
            text: t(
              "information.shippingDelivery.caymaHakkiVeAyipliUruneIliskin",
            ),
          },
          {
            type: "p",
            text: t(
              "information.shippingDelivery.iadeTalebiKabulEdildigindeKullaniciSiparis",
            ),
          },
        ],
      },
      {
        number: "8",
        heading: t("information.shippingDelivery.takasGonderileri"),
        blocks: [
          {
            type: "p",
            text: t(
              "information.shippingDelivery.takasKabulEdildigindeHerIkiTaraf",
            ),
          },
          {
            type: "list",
            items: [
              {
                text: t(
                  "information.shippingDelivery.herTarafinOdeyecegiTakasKargoUcreti",
                ),
              },
              {
                text: t(
                  "information.shippingDelivery.takasKomisyonuIlgiliUrununKategoriIslem",
                ),
              },
              {
                text: t(
                  "information.shippingDelivery.kontroldeUyusmazlikIptalVeyaRetOlusmasi",
                ),
              },
            ],
          },
        ],
      },
      {
        number: "9",
        heading: t("information.shippingDelivery.destekVeOncelikSirasi"),
        blocks: [
          {
            type: "p",
            text: t(
              "information.shippingDelivery.kargoKoduTakipGecikmeKayipHasar",
            ),
          },
        ],
      },
    ],
  },
];
