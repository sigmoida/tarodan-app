/**
 * Netsis fatura fişine (ItemSlips) yazdığımız alanların ADLARI ve sabit
 * değerleri — TEK yer.
 *
 * Netsis'e henüz erişimimiz yok: belge tipi kodları `modules/netsis`'teki
 * `NETSIS_DOC_TYPES`'tan, aşağıdaki her alan adı NetOpenX nesne modelinden ve
 * TBLFATUIRS/TBLFATUEK/TBLSTHAR kolonlarından TAHMİN edildi ve `VERIFY`
 * taşır. `pnpm smoke:netsis` dökümleriyle (`definitions/ItemSlips`)
 * sabitlendiğinde değişen yalnız bu dosya olur; eşleyici
 * (`netsis-slip.mapper.ts`) adları buradan okur. Ayrıntı: docs/NETSIS.md.
 */
import { NETSIS_SLIP_TRACKING_KEY_FIELD } from "../../netsis";

/** VERIFY: `FatUst.TIPI` — kapalı (peşin) satış faturası / iade faturası. */
export const NETSIS_SLIP_TIPI = {
  sale: "ftKapali",
  return: "ftIade",
} as const;

/** VERIFY: e-belge türü bayrağı (`FatUst.EBELGE_TIPI`). */
export const NETSIS_EDOCUMENT_KIND = {
  EINVOICE: "EFATURA",
  EARCHIVE: "EARSIV",
} as const;

// VERIFY against GET definitions/ItemSlips — başlık (FatUst) alanları.
export const NETSIS_HEADER_FIELDS = {
  /** e-Fatura / e-Arşiv bayrağı. */
  eDocumentKind: "EBELGE_TIPI",
  /** e-Arşiv gönderim şekli (ELEKTRONIK / KAGIT). */
  eArchiveSendType: "EARSIV_GONDERIM_SEKLI",
  /** Belge saati (HH:mm:ss). */
  issueTime: "FATURA_SAATI",
  /**
   * Bizim ETTN'imiz. Netsis dışarıdan verilen ETTN'i kabul etmezse kendi
   * ETTN'ini atar; gönderim sonucundaki ETTN kayda yazılır.
   */
  ettn: "ETTN",
  /**
   * Fişi yeniden bulmak için: bizim ETTN (ek açıklama 1). Alan adı Netsis
   * modülünün izleme anahtarıdır — `itemSlips.findByTrackingKey` aynı alanı
   * arar (kayıp yanıttan sonra ikinci fiş açılmasın).
   */
  ourEttnReference: NETSIS_SLIP_TRACKING_KEY_FIELD,
  /** Fişi yeniden bulmak için: Kayıt No KYT-… (ek açıklama 2). */
  sourceReference: "EKACK2",
  /** İade faturasında orijinal belgenin numarası ve tarihi. */
  returnOfNumber: "IADE_FATIRS_NO",
  returnOfDate: "IADE_FATIRS_TARIH",
  /**
   * Ortak perakende caride belgenin GERÇEK alıcısı. Cari kartı tüm bireysel
   * alıcılarda aynıdır; GİB'e giden belgede kişinin adı, TCKN'si ve adresi
   * bu alanlardan basılır.
   */
  recipientTitle: "EBELGE_ALICI_UNVAN",
  recipientFirstName: "EBELGE_ALICI_AD",
  recipientLastName: "EBELGE_ALICI_SOYAD",
  recipientTaxId: "EBELGE_ALICI_VKNTCKN",
  recipientAddress: "EBELGE_ALICI_ADRES",
  recipientCity: "EBELGE_ALICI_IL",
  recipientDistrict: "EBELGE_ALICI_ILCE",
  recipientEmail: "EBELGE_ALICI_EPOSTA",
} as const;

// VERIFY against GET definitions/ItemSlips — satır (Kalems) alanları.
export const NETSIS_LINE_FIELDS = {
  /**
   * Satır iskontosu, YÜZDE. Net birim fiyat (`STHAR_NF`) zaten indirim
   * düşülmüş gönderilir; Netsis NF'yi BF − iskontodan yeniden türetiyorsa
   * iskonto iki kez düşülür — `ItemSlips/Calculate` karşılaştırması bunu
   * yakalar ve belge gönderilmez.
   */
  discountPercent: "STHAR_SATISK",
} as const;

/** VERIFY: varchar uzunlukları (FatUst.ACIKLAMA, STHAR_ACIKLAMA, STOK_ADI, CARI_ISIM). */
export const NETSIS_TEXT_MAX_LENGTH = {
  slipDescription: 50,
  lineDescription: 50,
  itemName: 50,
  cariName: 100,
} as const;

/** VERIFY: hizmet kartının birimi (adet). */
export const NETSIS_SERVICE_ITEM_UNIT = "AD";

/** Birim fiyatın ondalık hanesi (VERIFY: Netsis fiyat hassasiyeti). */
export const NETSIS_UNIT_PRICE_DECIMALS = 6;

/** `ItemSlips/Calculate` ile kayıt toplamları arasındaki izin verilen fark (TRY). */
export const NETSIS_TOTALS_TOLERANCE = "0.01";

/** `providerRef` biçimi: `<FaturaTip>:<FATIRS_NO>`. */
export const NETSIS_PROVIDER_REF_SEPARATOR = ":";
