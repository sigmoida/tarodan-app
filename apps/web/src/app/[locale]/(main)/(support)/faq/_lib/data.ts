/** @format */
import type { Translate } from "@/types/i18n";

/**
 * SSS içeriği — tek kaynak.
 *
 * Sayfa eskiden CMS'ten (`/api/pages/faq`) besleniyordu; metin kurumsal olarak
 * sabitlendiği için artık burada duruyor. Bölüm `id`'leri dış bağlantılar
 * (Yardım & Destek konu listeleri) tarafından anchor olarak kullanılır.
 */

export interface FaqEntry {
  q: string;
  /** Cevap paragrafları — sırayla basılır. */
  a: string[];
  /** Paragraflardan sonra gelen madde listesi (etiket kalın). */
  bullets?: { label?: string; text: string }[];
}

export interface FaqSection {
  id: string;
  title: string;
  entries: FaqEntry[];
}

export const faqSections = (t: Translate): FaqSection[] => [
  {
    id: "alisveris-takas",
    title: t("faq.content.alisverisVeTakasRehberi"),
    entries: [
      {
        q: t("faq.content.nasilSiparisOlusturabilirim"),
        a: [
          t("faq.content.koleksiyonunuzaDahilEtmekIstediginizModelAraclari"),
          t("faq.content.odemeyeGecButonunaTikladiktanSonraTeslimat"),
        ],
      },
      {
        q: t("faq.content.takasIslemleriniNasilYapiyoruz"),
        a: [t("faq.content.heyecanVericiBirDigerDetayIse")],
      },
      {
        q: t("faq.content.siparisiminVeyaTakasiminDurumunuNasilTakip"),
        a: [
          t("faq.content.tarodanUygulamasiniActiktanSonraSiparislerinizIcin"),
        ],
      },
      {
        q: t("faq.content.tekSepetteBirdenFazlaModelAlabilir"),
        a: [t("faq.content.evetSepetinizdekiTumGuzellikleriVeTakas")],
      },
      {
        q: t("faq.content.odenecekTutariModelFiyatindanNedenDaha"),
        a: [t("faq.content.sectiginizModelinFiyatiDisindaKargoGonderim")],
      },
      {
        q: t("faq.content.odemeIslemleriNasilGerceklestirilir"),
        a: [
          t(
            "faq.content.odemeleriniziTarodaninGuvenliAltyapisiniKullanarakKredi",
          ),
        ],
      },
      {
        q: t("faq.content.gozumGibiBaktigimOdememGuvendeMi"),
        a: [t("faq.content.kesinlikleSizModelinizeKavusupSipariseOnay")],
      },
      {
        q: t("faq.content.kargoGonderimUcretiniKimOder"),
        a: [t("faq.content.kargoUcretiIlaniOlustururkenSaticininTercihine")],
      },
      {
        q: t("faq.content.siparisimNeZamanKargolanir"),
        a: [
          t(
            "faq.content.saticinizModeliniziOzenlePaketleyipHazirladiktanSonra",
          ),
        ],
      },
      {
        q: t("faq.content.kargomuNasilTakipEdebilirim"),
        a: [t("faq.content.modelinizKargoyaVerildiktenSonraSistemUzerinde")],
      },
      {
        q: t("faq.content.siparisNeZamanTamamlanir"),
        a: [t("faq.content.kargonuzKapiyaGeldiBittiSandinizDegil")],
      },
      {
        q: t("faq.content.odememSaticiyaNeZamanGecer"),
        a: [t("faq.content.sizKargonuzuTeslimAlipHerSey")],
      },
      {
        q: t("faq.content.neZamanIadeTalebiOlusturabilirim"),
        a: [t("faq.content.beklenmeyenBirDurumlaKarsilastiginizdaVeyaUrun")],
      },
      {
        q: t("faq.content.aliciHizmetBedeliVeSaticiKomisyonu"),
        a: [t("faq.content.platformunGuvenliAltyapisiniOdemeHavuzuSistemini")],
      },
    ],
  },
  {
    id: "populer-konular",
    title: t("faq.content.populerKonular"),
    entries: [
      {
        q: t("faq.content.ilkSatisimiNasilYaparim"),
        a: [t("faq.content.garajinizdaYeniSahipleriniBekleyenModelAraclar")],
      },
      {
        q: t("faq.content.urunlerimiNasilOnPlanaCikartirim"),
        a: [
          t("faq.content.garajinizdakiModelAraclarinHakEttigiDegeri"),
          t("faq.content.kisaSureliVeHizliBirIvme"),
        ],
        bullets: [
          {
            label: t("faq.content.200999TlArasiUrunler"),
            text: t("faq.content.anaSayfaOneCikarilanlar150Tl"),
          },
          {
            label: t("faq.content.10005000TlArasi"),
            text: t("faq.content.anaSayfaOneCikarilanlar250Tl"),
          },
          {
            label: t("faq.content.5000TlVeUzeriNadide"),
            text: t("faq.content.anaSayfaOneCikarilanlar500Tl"),
          },
        ],
      },
      {
        q: t("faq.content.30GunlukOneCikarmaPaketleriNelerdir"),
        a: [t("faq.content.modeliniziUzunSolukluBirVitrinDeneyimiyle")],
        bullets: [
          {
            label: t("faq.content.200999TlArasiUrunler"),
            text: t("faq.content.anaSayfaOneCikarilanlar550Tl"),
          },
          {
            label: t("faq.content.10005000TlArasi"),
            text: t("faq.content.anaSayfaOneCikarilanlar750Tl"),
          },
          {
            label: t("faq.content.5000TlVeUzeriNadide"),
            text: t("faq.content.anaSayfaOneCikarilanlar1900"),
          },
        ],
      },
      {
        q: t("faq.content.takasTeklifiNasilGonderirim"),
        a: [t("faq.content.urunListelerindeVeyaDetaySayfalarindaTakas")],
      },
      {
        q: t("faq.content.uyelikPlanlariArasindakiFarklarNelerdir"),
        a: [
          t("faq.content.tarodandaKoleksiyonunuzuSergilemekAlisverisYapmakVe"),
        ],
      },
      {
        q: t("faq.content.siparisimiNasilTakipEderim"),
        a: [t("faq.content.yeniGozBebeginizinYolaCikisHeyecanini")],
      },
      {
        q: t("faq.content.iadeVeDegisimPolitikasiNedir"),
        a: [t("faq.content.koleksiyonTutkunlugununNeKadarHassasBir")],
      },
    ],
  },
];
