/**
 * Sürat Kargo GonderiyiKargoyaGonder + KargoTakipHareketDetayi sonuç ve
 * payload tipleri. Resmi Sürat Kargo API dokümanlarına dayanır.
 */

import type { CargoShipmentRequest } from "./cargo-provider";

// ─── Technical error classification ───────────────────────────────────────────

export type SuratTechnicalCode =
  | "TIMEOUT"
  | "NETWORK"
  | "HTTP_5XX"
  | "PARSE_ERROR"
  | "EMPTY_RESPONSE"
  | "TRACKING_PENDING"
  | "SOAP_FAULT"
  | "UNKNOWN";

// ─── Shipment result types ────────────────────────────────────────────────────

export type SuratShipmentSuccess = {
  ok: true;
  suratMessage: "Tamam";
  correlationId: string;
  idempotencyKey: string;
};

export type SuratTechnicalFailure = {
  ok: false;
  kind: "technical";
  code: SuratTechnicalCode;
  cause: Error | undefined;
  rawBodySnippet?: string;
  correlationId: string;
  idempotencyKey: string;
};

export type SuratBusinessFailure = {
  ok: false;
  kind: "business";
  suratMessage: string;
  correlationId: string;
  idempotencyKey: string;
};

export type SuratShipmentResult =
  SuratShipmentSuccess | SuratTechnicalFailure | SuratBusinessFailure;

export type SuratShipmentFailure = SuratTechnicalFailure | SuratBusinessFailure;

// ─── Create + tracking result ─────────────────────────────────────────────────
// Gönderi resmi create ucuyla oluşturulur; gerçek KargoTakipNo resmi takip
// ucundan okunur. Bu iki endpoint ZPL döndürmediği için labelZpl null kalır.

export type SuratBarcodeSuccess = {
  ok: true;
  /** Real Sürat cargo code (KargoTakipNo) — shown after branch acceptance. */
  kargoTakipNo: string;
  /** Resmi create+tracking sözleşmesinde ZPL dönmez; daima null. */
  labelZpl: string | null;
  suratMessage: string;
  correlationId: string;
  idempotencyKey: string;
};

export type SuratBarcodeResult =
  SuratBarcodeSuccess | SuratTechnicalFailure | SuratBusinessFailure;

// ─── Gonderi (Shipment) payload — resmi REST Gonderi modeli ───────────────────

/** KargoTuru: 1=Dosya, 2=Mi, 3=Koli (WSDL: int) */
export enum SuratKargoTuru {
  Dosya = 1,
  Mi = 2,
  Koli = 3,
}

/** OdemeTipi: 1=Peşin, 2=Alıcı Ödemeli (WSDL: int) */
export enum SuratOdemeTipi {
  Pesin = 1,
  AliciOdemeli = 2,
}

/** TasimaSekli: 1=Kara Yolu, 2=Uçak, 3=Motor/Kurye (WSDL: int) */
export enum SuratTasimaSekli {
  KaraYolu = 1,
  Ucak = 2,
  MotorKurye = 3,
}

/** TeslimSekli: 1=Adrese Teslim, 2=Şubede Teslim (WSDL: int) */
export enum SuratTeslimSekli {
  AdreseTeslim = 1,
  SubedeTeslim = 2,
}

/** GonderiSekli: 0=Standart, 5=Bukoli, 8=Pudo (WSDL: int) */
export enum SuratGonderiSekli {
  Standart = 0,
  Bukoli = 5,
  Pudo = 8,
}

/** KapidanOdemeTahsilatTipi: 1=Nakit, 2=POS (WSDL: int) */
export enum SuratKapidanOdemeTahsilatTipi {
  Nakit = 1,
  POS = 2,
}

/**
 * Full Gonderi payload matching the documented Sürat Kargo REST model.
 * Fields marked optional are "Zorunlu Değil" per the documentation.
 */
export interface SuratGonderiPayload {
  // ── Alıcı bilgileri (Zorunlu) ──
  /** Alıcı adı/soyadı veya kurum adı */
  KisiKurum: string;
  /** Alıcı adresi */
  AliciAdresi: string;
  /** Alıcı ili */
  Il: string;
  /** Alıcı ilçesi */
  Ilce: string;
  /** Alıcı cep telefonu (05xx veya 905xx formatında) */
  TelefonCep: string;

  // ── Alıcı bilgileri (Opsiyonel) ──
  /** Birim/departman veya ürün bilgileri (";" ile ayrılmış) */
  SahisBirim?: string;
  /** Ev telefonu */
  TelefonEv?: string;
  /** İş telefonu */
  TelefonIs?: string;
  /** E-posta */
  Email?: string;
  /** Sürat Kargo tarafında alıcının cari kodu */
  AliciKodu?: string;

  // ── Kargo bilgileri (Zorunlu, WSDL'e göre) ──
  /** Kargo türü: 1=Dosya, 2=Mi, 3=Koli (WSDL: int) */
  KargoTuru: SuratKargoTuru;
  /** Ödeme tipi: 1=Peşin, 2=Alıcı Ödemeli (WSDL: OdemeTipi int) */
  OdemeTipi: SuratOdemeTipi;
  /** Müşteri sipariş numarası (max 50 karakter) */
  OzelKargoTakipNo: string;
  /** Kargo adedi (WSDL: int) */
  Adet: number;
  /** Bir parçanın desi bilgisi (REST isteğinde string gönderilir) */
  BirimDesi: number;
  /** Bir parçanın kg bilgisi (REST isteğinde string gönderilir) */
  BirimKg: number;
  /** Kapıdan ödeme tahsilat tipi; peşin gönderide 0. */
  KapidanOdemeTahsilatTipi: SuratKapidanOdemeTahsilatTipi | 0;
  /** Taşıma şekli (WSDL: int) */
  TasimaSekli: SuratTasimaSekli;
  /** Teslim şekli (WSDL: int) */
  TeslimSekli: SuratTeslimSekli;
  /** Gönderi şekli (WSDL: int nillable) */
  GonderiSekli: SuratGonderiSekli;
  /** Pazaryeri mi: 0=Hayır, 1=Evet (WSDL: int) */
  Pazaryerimi: 0 | 1;
  /** İade mi: false=Standart, true=İade (WSDL: boolean) */
  Iademi: boolean;

  // ── Kargo bilgileri (Opsiyonel) ──
  /** Referans no (gruplandırma için) */
  ReferansNo?: string;
  /** İrsaliye seri no (kapıdan ödeme için zorunlu, max 5 karakter) */
  IrsaliyeSeriNo?: string;
  /** İrsaliye sıra no (kapıdan ödeme için zorunlu, max 10 karakter) */
  IrsaliyeSiraNo?: string;
  /** Parçalı gönderiler için: "desi:kg:kargoTürüEnum:adet;" formatında */
  KargoIcerigi?: string;
  /** Kapıdan ödeme tutarı */
  KapidanOdemeTutari?: number;
  /** Ek hizmetler: "GondericiyeSms,TelefonIhbar,AliciyaSms,AdrestenAlim" */
  EkHizmetler?: string;
  /** Sevk adresi */
  SevkAdresi?: string;
  /** Teslim şube kodu (şubede teslim için) */
  TeslimSubeKodu?: string;
  /** Entegrasyon firması: "Trendyol", "Hepsiburada", "N11", "Pazarama", "LCW" */
  EntegrasyonFirmasi?: string;
}

/**
 * Bir gönderiyi tel biçiminden ÖNCE tanımlayan nötr girdi.
 *
 * Taşıyıcı istemcisinin sözleşmesi budur; hangi Sürat sürümüne hangi alan
 * adlarıyla gidileceği istemcinin içinde kalır. Böylece `SuratCargoService`
 * (idempotency, retry, takip) sürümden habersiz çalışır ve iki sürüm yan yana
 * yaşayabilir.
 */
export type SuratCreateShipmentInput = Omit<
  CargoShipmentRequest,
  "idempotencyKey" | "correlationId"
>;

export interface SuratShipmentInput {
  idempotencyKey: string;
  correlationId: string;
  shipment: SuratCreateShipmentInput;
}

// ─── Kargo Takip API types (REST) ─────────────────────────────────────────────

export interface SuratTakipHareket {
  HareketObjId: number;
  IslemSubesi: number;
  IslemSureci: string | null;
  Aciklama: string | null;
  IslemTarihi: string;
  HareketYeri: string;
  Islem: string;
  KargoHareketKargonunDurumuSayi?: string;
}

export interface SuratTakipGonderi {
  KargoObjId: number;
  EvrakTuru: string;
  SeriNo: string;
  SiraNo: number;
  Evraktarihi: string;
  TesellumdenFaturaNo: string | null;
  PlanlananTeslimTarihi: string;
  Satiskodu: string;
  ToplamAdet: number;
  ParcaSiraSayi: string;
  ToplamDesiKg: number;
  KdvTutar: number;
  TutarKdvsiz: number;
  Tutar: number;
  IadeTutar?: number;
  CikisSubesi: string;
  CikisSubeTel: string;
  TeslimatSubesi: string;
  TeslimatSubeTel: string;
  KargoTakipNo: string;
  TakipUrl: string;
  KargonunBulunduguYer: string;
  SonHareketTarihi: string;
  KargonunDurumu: string;
  KargonunDurumuSayi: number;
  KargoHareketTip: string | null;
  DevirDurum: string;
  DevirSebebi: string;
  IadeDurum: string;
  IadeAciklama: string;
  TeslimTarihi: string;
  TeslimAlan: string;
  Hareketler: SuratTakipHareket[];
}

export interface SuratTakipResponse {
  IsError: boolean;
  errorMessage: string | null;
  Gonderiler: SuratTakipGonderi[];
}

/**
 * KargoTakipHareketDetayi sonucu. Sürat, gönderi ön bildirimi alınmış fakat
 * şubede henüz kabul edilmemişken HTTP 200 + IsError=true döndürür. Bu durum
 * teknik hata değildir; poller daha sonra yeniden denemelidir.
 */
export type SuratTrackingLookupResult =
  | { kind: "found"; data: SuratTakipResponse }
  | { kind: "pending"; message: string }
  | {
      kind: "failure";
      category:
        "configuration" | "http" | "provider" | "timeout" | "network" | "parse";
      message: string;
      httpStatus?: number;
    };
