/** @format */
import type { Translate } from "@/types/i18n";

/**
 * Satıcı sözleşmeleri — kurumsal metnin tek kaynağı.
 *
 * İki ayrı sözleşme var (bireysel / kurumsal) ama komisyon tablosu ikisinde de
 * BİREBİR aynı, o yüzden tablo tek sabit olarak tutulup iki bölümde de
 * gösteriliyor. Oranlar değişirse tek yerden değişir.
 */

export interface AgreementClause {
  /** Kalın basılacak madde adı (örn. "Doğrulama"). */
  label?: string;
  text: string;
}

export interface AgreementSection {
  title: string;
  /** Maddelerden önce gelen açıklama. */
  intro?: string;
  clauses?: AgreementClause[];
  /** Bu bölümün altında komisyon tablosu gösterilsin mi? */
  showFeeTable?: boolean;
}

export interface FeeRow {
  range: string;
  sellerCommission: string;
  buyerCommission: string;
  sellerShipping: string;
  buyerShipping: string;
  sellerServiceFee: string;
  buyerProtectionFee: string;
}

export const feeTable = (t: Translate): FeeRow[] => [
  {
    range: t("legal.sellerAgreement.250Tl999Tl"),
    sellerCommission: "%6",
    buyerCommission: "%4",
    sellerShipping: t("legal.sellerAgreement.50Tl"),
    buyerShipping: t("legal.sellerAgreement.50Tl"),
    sellerServiceFee: "%5",
    buyerProtectionFee: "%5",
  },
  {
    range: t("legal.sellerAgreement.1000Tl9999Tl"),
    sellerCommission: "%6",
    buyerCommission: "%4",
    sellerShipping: t("legal.sellerAgreement.50Tl"),
    buyerShipping: t("legal.sellerAgreement.50Tl"),
    sellerServiceFee: "%5",
    buyerProtectionFee: "%6",
  },
  {
    range: t("legal.sellerAgreement.10000Tl24999Tl"),
    sellerCommission: "%6",
    buyerCommission: "%3",
    sellerShipping: t("legal.sellerAgreement.50Tl"),
    buyerShipping: t("legal.sellerAgreement.50Tl"),
    sellerServiceFee: "%5",
    buyerProtectionFee: "%4",
  },
  {
    range: t("legal.sellerAgreement.25000TlVeUstu"),
    sellerCommission: "%3",
    buyerCommission: "%3",
    sellerShipping: t("legal.sellerAgreement.50Tl"),
    buyerShipping: t("legal.sellerAgreement.50Tl"),
    sellerServiceFee: "%3",
    buyerProtectionFee: "%3",
  },
  {
    range: t("legal.sellerAgreement.takas"),
    sellerCommission: "—",
    buyerCommission: "—",
    sellerShipping: t("legal.sellerAgreement.100Tl"),
    buyerShipping: t("legal.sellerAgreement.100Tl"),
    sellerServiceFee: t("legal.sellerAgreement.150Tl"),
    buyerProtectionFee: t("legal.sellerAgreement.150Tl"),
  },
];

export const individualIntro = (t: Translate) =>
  t("legal.sellerAgreement.tarodanPlatformundaBireyselOlarakModelArac");

export const individualAgreement = (t: Translate): AgreementSection[] => [
  {
    title: t("legal.sellerAgreement.1TaraflarVeKapsam"),
    intro: t("legal.sellerAgreement.isbuSozlesmeTarodanPlatformuPlatformIle"),
  },
  {
    title: t("legal.sellerAgreement.2BireyselSaticiOnboardingVeHesap"),
    clauses: [
      {
        label: t("legal.sellerAgreement.bilgiVeBelgeTalebi"),
        text: t(
          "legal.sellerAgreement.bireyselSaticilarPlatformaKayitOlurkenAd",
        ),
      },
      {
        label: t("legal.sellerAgreement.dogrulama"),
        text: t("legal.sellerAgreement.tarodanGuvenlikVeYasalUyumlulukGeregi"),
      },
    ],
  },
  {
    title: t("legal.sellerAgreement.3UrunListelemeKondisyonVeSeffaflik"),
    clauses: [
      {
        text: t("legal.sellerAgreement.bireyselSaticiIlaniniActigiModelAracin"),
      },
      {
        text: t("legal.sellerAgreement.modeldeVeyaOrijinalKutusundaCizikKirik"),
      },
    ],
  },
  {
    title: t("legal.sellerAgreement.4PaketlemeVeKargoSurecleri"),
    clauses: [
      {
        text: t(
          "legal.sellerAgreement.saticiSatisiGerceklesenModeliBaloncukluNaylon",
        ),
      },
      {
        text: t("legal.sellerAgreement.satisiYapilanUrunEnGec3"),
      },
    ],
  },
  {
    title: t("legal.sellerAgreement.5GuvenliOdemeVeHavuzSistemi"),
    clauses: [
      {
        text: t("legal.sellerAgreement.satisBedeliAliciUrunuTeslimAlip"),
      },
      {
        text: t("legal.sellerAgreement.havaleEftVeyaEldenOdemeGibi"),
      },
    ],
  },
  {
    title: t("legal.sellerAgreement.6TakasSurecleri"),
    clauses: [
      {
        text: t(
          "legal.sellerAgreement.takasAcikOlarakListelenenUrunlerdeTaraflar",
        ),
      },
    ],
  },
  {
    title: t("legal.sellerAgreement.7YaptirimlarVeAskiyaAlma"),
    clauses: [
      {
        text: t(
          "legal.sellerAgreement.gecikmeliKargolamaYanilticiIlanBilgileriVeya",
        ),
      },
    ],
  },
  {
    title: t("legal.sellerAgreement.8KomisyonHizmetBedelleriVeGuvenli"),
    clauses: [
      {
        text: t(
          "legal.sellerAgreement.tumTahsilatlarTarodanGuvenliOdemeAltyapisi",
        ),
      },
      {
        text: t(
          "legal.sellerAgreement.bireyselSatislarUzerindenKesilecekKomisyonOranlari",
        ),
      },
    ],
    showFeeTable: true,
  },
];

export const corporateIntro = (t: Translate) =>
  t("legal.sellerAgreement.tarodanPlatformundaTicariUnvaniIleMagaza");

export const corporateAgreement = (t: Translate): AgreementSection[] => [
  {
    title: t("legal.sellerAgreement.1TaraflarVeKapsam"),
    intro: t("legal.sellerAgreement.isbuSozlesmeTarodanPlatformuPlatformIle2"),
  },
  {
    title: t("legal.sellerAgreement.2KurumsalOnboardingDogrulamaVeBelge"),
    intro: t("legal.sellerAgreement.kurumsalSaticilar6563SayiliKanunVe"),
    clauses: [
      {
        label: t("legal.sellerAgreement.sirketVeVergiBilgileri"),
        text: t("legal.sellerAgreement.vergiLevhasiTicaretSicilGazetesiImza"),
      },
      {
        label: t("legal.sellerAgreement.yasalIletisimBilgileri"),
        text: t("legal.sellerAgreement.kayitliElektronikPostaKepAdresiMersis"),
      },
      {
        label: t("legal.sellerAgreement.finansalBilgiler"),
        text: t("legal.sellerAgreement.sirketUnvaninaTescilliResmiBankaHesap"),
      },
      {
        text: t(
          "legal.sellerAgreement.kurumsalSaticiSunduguBelgelerinDogrulugunuTaahhut",
        ),
      },
    ],
  },
  {
    title: t("legal.sellerAgreement.3YasalVeTicariSorumluluklar"),
    clauses: [
      {
        label: t("legal.sellerAgreement.faturaVeVergiYukumlulugu"),
        text: t(
          "legal.sellerAgreement.kurumsalSaticiPlatformUzerindenGerceklestirdigiTum",
        ),
      },
      {
        label: t("legal.sellerAgreement.tuketiciHaklariVeGaranti"),
        text: t(
          "legal.sellerAgreement.6502SayiliTuketicininKorunmasiHakkindaKanun",
        ),
      },
    ],
  },
  {
    title: t("legal.sellerAgreement.4IlanStokVeFiyatlandirmaStandartlari"),
    clauses: [
      {
        text: t(
          "legal.sellerAgreement.kurumsalSaticilarStoklarindaYerAlanUrunleri",
        ),
      },
      {
        text: t(
          "legal.sellerAgreement.urunGorsellerindeTelifHaklarinaUygunProfesyonel",
        ),
      },
    ],
  },
  {
    title: t("legal.sellerAgreement.5PaketlemeLojistikVeOperasyonelSurecler"),
    clauses: [
      {
        text: t(
          "legal.sellerAgreement.kurumsalSaticiYuksekHacimliSiparislerdeDahi",
        ),
      },
      {
        text: t(
          "legal.sellerAgreement.kargoTakipNumaralarininSistemeZamanindaGirilmesi",
        ),
      },
    ],
  },
  {
    title: t("legal.sellerAgreement.6KomisyonHizmetBedelleriVeGuvenli"),
    clauses: [
      {
        text: t(
          "legal.sellerAgreement.tumTahsilatlarTarodanGuvenliOdemeAltyapisi",
        ),
      },
      {
        text: t(
          "legal.sellerAgreement.kurumsalSatislarUzerindenKesilecekKomisyonOranlari",
        ),
      },
    ],
    showFeeTable: true,
  },
  {
    title: t("legal.sellerAgreement.7DenetimRiskYonetimiVeHesabin"),
    clauses: [
      {
        text: t(
          "legal.sellerAgreement.kurumsalSaticininSahteReplikaUrunSatmasi",
        ),
      },
    ],
  },
];
