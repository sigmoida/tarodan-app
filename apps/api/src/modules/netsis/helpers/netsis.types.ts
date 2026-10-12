import type { Prisma } from "@prisma/client";
import type { NetsisMode } from "../../../config/netsis";

/**
 * NetOpenX REST modelleri — EN İYİ TAHMİN.
 *
 * Henüz bir Netsis sunucusuna erişimimiz yok. Alan adları Netsis tablo
 * kolonlarından (TBLCASABIT, TBLSTSABIT, TBLFATUIRS, TBLSTHAR), kapsayıcı
 * adları (`CariTemelBilgi`, `StokTemelBilgi`, `FatUst`, `Kalems`) NetOpenX
 * nesne modelinden alındı. Her model `// VERIFY against GET definitions/<R>`
 * taşır: `pnpm smoke:netsis` gerçek tanımları `scripts/netsis-definitions/`
 * altına döker, sabitleme o zaman yalnız bu dosyada bir TİP düzenlemesidir.
 *
 * Kaçış kapısı: her model `NetsisPassthrough` genişletir — burada adı geçmeyen
 * bir alan tipten düşmeden olduğu gibi gönderilir/okunur. Modelin anahtar
 * alanlarını okuyan kod yalnız `netsis-model.helper.ts`'tedir; şekil değişirse
 * düzeltilecek tek yer orası.
 */

/** Sabitlenmemiş alanlar için açık uç. */
export interface NetsisPassthrough {
  [field: string]: unknown;
}

/** Şekli bilinmeyen ham Netsis kaydı (liste satırı, sorgu sonucu, yanıt). */
export type NetsisRawRecord = Record<string, unknown>;

/** Bir çağrıyı açık bir NetOpenX transaction'ına bağlar. */
export interface NetsisCallOptions {
  transactionId?: string;
}

/** `withTransaction` içinde verilen bağlam — her çağrıya aynen geçirilir. */
export interface NetsisTransactionContext extends NetsisCallOptions {
  transactionId: string;
}

// ---------------------------------------------------------------------------
// ARPs (Cari)
// ---------------------------------------------------------------------------

// VERIFY against GET definitions/ARPs
export interface NetsisArpBasicInfo extends NetsisPassthrough {
  CARI_KOD: string;
  CARI_ISIM?: string;
  VERGI_NUMARASI?: string;
  VERGI_DAIRESI?: string;
  CARI_ADRES?: string;
  CARI_IL?: string;
  CARI_ILCE?: string;
  EMAIL?: string;
}

// VERIFY against GET definitions/ARPs
export interface NetsisArpExtraInfo extends NetsisPassthrough {
  TCKIMLIKNO?: string;
}

// VERIFY against GET definitions/ARPs
export interface NetsisArp extends NetsisPassthrough {
  CariTemelBilgi: NetsisArpBasicInfo;
  CariEkBilgi?: NetsisArpExtraInfo;
}

// ---------------------------------------------------------------------------
// Items (Stok)
// ---------------------------------------------------------------------------

// VERIFY against GET definitions/Items
export interface NetsisItemBasicInfo extends NetsisPassthrough {
  STOK_KODU: string;
  STOK_ADI?: string;
  /** Yüzde, ör. 20. */
  KDV_ORANI?: number;
  OLCU_BR1?: string;
}

// VERIFY against GET definitions/Items
export interface NetsisItem extends NetsisPassthrough {
  StokTemelBilgi: NetsisItemBasicInfo;
  StokEkBilgi?: NetsisPassthrough;
}

// ---------------------------------------------------------------------------
// ItemSlips (Fatura)
// ---------------------------------------------------------------------------

/** Para/miktar alanları: sayı ya da ondalık metin ("199.90"). */
export type NetsisNumeric = number | string;

// VERIFY against GET definitions/ItemSlips
export interface NetsisItemSlipHeader extends NetsisPassthrough {
  /** Belge numarası, ör. TRD2026000000001. Boşsa Netsis numaralar (VERIFY). */
  FATIRS_NO?: string;
  CARI_KODU: string;
  /** Kapalı/açık/iade tipi (VERIFY: kod listesi). */
  TIPI?: NetsisNumeric;
  /** ISO tarih (YYYY-MM-DD). */
  TARIH: string;
  FTIRSIP?: string;
  ACIKLAMA?: string;
}

// VERIFY against GET definitions/ItemSlips
export interface NetsisItemSlipLine extends NetsisPassthrough {
  STOK_KODU: string;
  /** Miktar. */
  STHAR_GCMIK: NetsisNumeric;
  /** Net birim fiyat (KDV hariç). */
  STHAR_NF: NetsisNumeric;
  /** Brüt birim fiyat. */
  STHAR_BF?: NetsisNumeric;
  /** KDV oranı, yüzde. */
  STHAR_KDV: NetsisNumeric;
  STHAR_ACIKLAMA?: string;
}

// VERIFY against GET definitions/ItemSlips
export interface NetsisItemSlip extends NetsisPassthrough {
  /** `NETSIS_DOC_TYPES` değerlerinden biri. */
  FaturaTip: string;
  FatUst: NetsisItemSlipHeader;
  Kalems: NetsisItemSlipLine[];
}

/** Bir faturayı tanımlayan anahtar (Details/Html/Delete gövdesi). VERIFY. */
export interface NetsisItemSlipKey extends NetsisPassthrough {
  FaturaTip: string;
  FATIRS_NO: string;
  CARI_KODU?: string;
}

/** `ItemSlips/Calculate` sonucunun normalize edilmiş toplamları. */
export interface NetsisSlipTotals {
  netAmount: Prisma.Decimal;
  vatAmount: Prisma.Decimal;
  grossAmount: Prisma.Decimal;
  raw: NetsisRawRecord;
}

// ---------------------------------------------------------------------------
// EDocument (EBelge)
// ---------------------------------------------------------------------------

// VERIFY against GET definitions/EDocument
export interface NetsisEDocumentRequest extends NetsisPassthrough {
  FaturaTip: string;
  FATIRS_NO: string;
  CARI_KODU?: string;
  /** Gönderimden sonra belli olan GİB evrensel tekil numarası. */
  ETTN?: string;
}

export type NetsisEDocumentState =
  | "draft"
  | "sent"
  | "accepted"
  | "rejected"
  | "cancelled"
  | "unknown";

export interface NetsisEDocumentSendResult {
  ettn: string | null;
  raw: NetsisRawRecord;
}

export interface NetsisEDocumentStatus {
  state: NetsisEDocumentState;
  ettn: string | null;
  raw: NetsisRawRecord;
}

// ---------------------------------------------------------------------------
// MixedReceiptsMain (Hızlı tahsilat) / BankRemittanceTransfer (Havale/EFT)
// ---------------------------------------------------------------------------

// VERIFY against GET definitions/MixedReceiptsMain
export interface NetsisMixedReceipt extends NetsisPassthrough {
  CARI_KOD?: string;
  TARIH?: string;
  ACIKLAMA?: string;
  TUTAR?: NetsisNumeric;
}

// VERIFY against GET definitions/BankRemittanceTransfer
export interface NetsisBankTransfer extends NetsisPassthrough {
  TARIH?: string;
  TUTAR?: NetsisNumeric;
  ACIKLAMA?: string;
}

// ---------------------------------------------------------------------------
// Ping
// ---------------------------------------------------------------------------

export interface NetsisPingResult {
  mode: NetsisMode;
  version: string | null;
  authenticated: boolean;
}
