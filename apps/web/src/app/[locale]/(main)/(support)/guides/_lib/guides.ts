/** @format */
import type { Translate } from "@/types/i18n";

export interface GuideStep {
  title: string;
  content: string;
}

export interface Guide {
  /** Anchor id — /support ve FAQ sayfalarından `#selling` gibi linklenir. */
  id: string;
  title: string;
  steps: GuideStep[];
}

export const guideList = (t: Translate): Guide[] => [
  {
    id: "getting-started",
    title: t("guides.content.baslangicRehberi"),
    steps: [
      {
        title: t("guides.content.uyeOlun"),
        content: t("guides.content.ePostaAdresinizVeSifrenizleHizlica"),
      },
      {
        title: t("guides.content.profiliniziTamamlayin"),
        content: t(
          "guides.content.profilFotografiniziEkleyinHobinizdenKisacaBahseden",
        ),
      },
      {
        title: t("guides.content.adresEkleyin"),
        content: t(
          "guides.content.koleksiyonunuzaYeniParcalarEklemekVeyaTakas",
        ),
      },
      {
        title: t("guides.content.kesfetmeyeBaslayin"),
        content: t(
          "guides.content.zenginKategorilerimiziInceleyinFavoriSaticilariniziTakibe",
        ),
      },
    ],
  },
  {
    id: "buying",
    title: t("guides.content.alisverisRehberi"),
    steps: [
      {
        title: t("guides.content.modelArayin"),
        content: t(
          "guides.content.aramaCubugunuKullanarakAradiginizMarkayiOzel",
        ),
      },
      {
        title: t("guides.content.detaylariInceleyin"),
        content: t(
          "guides.content.modelinFotograflariniYakindanInceleyinSaticininAciklamalarin",
        ),
      },
      {
        title: t("guides.content.sepetinizeEkleyin"),
        content: t(
          "guides.content.begendiginizModeliSepeteEkleButonunaTiklayarak",
        ),
      },
      {
        title: t("guides.content.odemeniziTamamlayin"),
        content: t("guides.content.teslimatAdresiniziSecinSizeUygunKargo"),
      },
      {
        title: t("guides.content.siparisiniziVeTakaslariniziTakipEdin"),
        content: t(
          "guides.content.siparislerimVeTakaslarimSayfasiniZiyaretEderek",
        ),
      },
    ],
  },
  {
    id: "selling",
    title: t("guides.content.satisRehberi"),
    steps: [
      {
        title: t("guides.content.ilanVerin"),
        content: t("guides.content.anaSayfadaVeyaMenudeYerAlan"),
      },
      {
        title: t("guides.content.fotografEkleyin"),
        content: t("guides.content.modeliniziEnIyiSekildeYansitanFarkli"),
      },
      {
        title: t("guides.content.detaylariGirin"),
        content: t("guides.content.markaModelOlcekKondisyonVeAciklama"),
      },
      {
        title: t("guides.content.fiyatBelirleyin"),
        content: t("guides.content.piyasaArastirmasiYaparakRekabetciBirFiyat"),
      },
      {
        title: t("guides.content.ilaniniziYayinlayin"),
        content: t("guides.content.ilaninizHizliBirOnaySurecindenGectikten"),
      },
      {
        title: t("guides.content.satisiTamamlayin"),
        content: t(
          "guides.content.satisGerceklestigindeModeliOzenlePaketleyinKargoya",
        ),
      },
    ],
  },
  {
    id: "trade",
    title: t("guides.content.takasRehberi"),
    steps: [
      {
        title: t("guides.content.takasaAcikUrunleriKesfedin"),
        content: t("guides.content.urunListelerindeYerAlanTakasEtiketine"),
      },
      {
        title: t("guides.content.teklifiniziGonderin"),
        content: t(
          "guides.content.takasTeklifiButonunaTiklayinKendiGarajinizdan",
        ),
      },
      {
        title: t("guides.content.detaylariGorusun"),
        content: t(
          "guides.content.karsiTaraflaMesajlasarakTakasKosullariniDetaylandirin",
        ),
      },
      {
        title: t("guides.content.takasiOnaylayin"),
        content: t("guides.content.herIkiTarafDaSartlariOnayladiginda"),
      },
      {
        title: t("guides.content.guvenliGonderimSaglayin"),
        content: t(
          "guides.content.urunleriniziGuvenlePaketleyerekKargoyaVerinTarodan",
        ),
      },
    ],
  },
  {
    id: "photography",
    title: t("guides.content.fotografCekimRehberi"),
    steps: [
      {
        title: t("guides.content.dogalIsikKullanin"),
        content: t(
          "guides.content.cekimlerinizdeMutlakaDogalIsiktanYararlaninGunduz",
        ),
      },
      {
        title: t("guides.content.sadeBirArkaPlanTercihEdin"),
        content: t("guides.content.modelinDetaylarininOnPlanaCikmasiIcin"),
      },
      {
        title: t("guides.content.farkliAcilardanCekimYapin"),
        content: t("guides.content.modeliniziOnArkaYanVe45"),
      },
      {
        title: t("guides.content.kusurlariSeffafcaGosterin"),
        content: t("guides.content.modeldeCizikVeyaEksikParcaGibi"),
      },
      {
        title: t("guides.content.orijinalKutuyuUnutmayin"),
        content: t(
          "guides.content.modelinOrijinalKutusuVarsaMutlakaFotograflayin",
        ),
      },
    ],
  },
  {
    id: "shipping",
    title: t("guides.content.kargoRehberi"),
    steps: [
      {
        title: t("guides.content.dogruKoruyucuMalzemeKullanin"),
        content: t("guides.content.modeliniziBaloncukluNaylonKopukVeyaGazete"),
      },
      {
        title: t("guides.content.uygunBoyuttaSaglamKutuSecin"),
        content: t("guides.content.urununEbatlarinaUygunDayanikliBirKarton"),
      },
      {
        title: t("guides.content.ciftKatKorumaTercihEdin"),
        content: t(
          "guides.content.ozellikleKoleksiyonunuzdakiDegerliVeNadirParcalar",
        ),
      },
      {
        title: t("guides.content.netEtiketlemeYapin"),
        content: t("guides.content.gondericiVeAliciAdresBilgileriniOkunakli"),
      },
      {
        title: t("guides.content.kargoyaTeslimEdin"),
        content: t("guides.content.paketiniziKargoSubesineGoturerekSizeAtanan"),
      },
    ],
  },
];
