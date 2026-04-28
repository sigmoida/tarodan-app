/**
 * Sürat Kargo SOAP (GonderiyiKargoyaGonderYeni) — result & payload types.
 * Based on official Sürat Kargo API documentation (2024).
 */

// ─── Technical error classification ───────────────────────────────────────────

export type SuratTechnicalCode =
  | 'TIMEOUT'
  | 'NETWORK'
  | 'HTTP_5XX'
  | 'PARSE_ERROR'
  | 'EMPTY_RESPONSE'
  | 'SOAP_FAULT'
  | 'UNKNOWN';

// ─── Shipment result types ────────────────────────────────────────────────────

export type SuratShipmentSuccess = {
  ok: true;
  suratMessage: 'Tamam';
  correlationId: string;
  idempotencyKey: string;
};

export type SuratTechnicalFailure = {
  ok: false;
  kind: 'technical';
  code: SuratTechnicalCode;
  cause: Error | undefined;
  rawBodySnippet?: string;
  correlationId: string;
  idempotencyKey: string;
};

export type SuratBusinessFailure = {
  ok: false;
  kind: 'business';
  suratMessage: string;
  correlationId: string;
  idempotencyKey: string;
};

export type SuratShipmentResult =
  | SuratShipmentSuccess
  | SuratTechnicalFailure
  | SuratBusinessFailure;

export type SuratShipmentFailure = SuratTechnicalFailure | SuratBusinessFailure;

// ─── Gonderi (Shipment) payload — matches WSDL Gonderi class ──────────────────

/** KargoTuru: 1=Dosya, 2=Mi, 3=Koli */
export enum SuratKargoTuru {
  Dosya = 1,
  Mi = 2,
  Koli = 3,
}

/** Odemetipi: 1=Peşin, 2=Alıcı Ödemeli */
export enum SuratOdemeTipi {
  Pesin = 1,
  AliciOdemeli = 2,
}

/** TasimaSekli: 1=Kara Yolu, 2=Uçak, 3=Motor/Kurye */
export enum SuratTasimaSekli {
  KaraYolu = 1,
  Ucak = 2,
  MotorKurye = 3,
}

/** TeslimSekli: 1=Adrese Teslim, 2=Şubede Teslim */
export enum SuratTeslimSekli {
  AdreseTeslim = 1,
  SubedeTeslim = 2,
}

/** GonderiSekli: 0=Standart, 5=Bukoli, 8=Pudo */
export enum SuratGonderiSekli {
  Standart = 0,
  Bukoli = 5,
  Pudo = 8,
}

/** KapidanOdemeTahsilatTipi: 1=Nakit, 2=POS */
export enum SuratKapidanOdemeTahsilatTipi {
  Nakit = 1,
  POS = 2,
}

/**
 * Full Gonderi payload matching the Sürat Kargo WSDL spec.
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

  // ── Kargo bilgileri (Zorunlu) ──
  /** Kargo türü: 1=Dosya, 2=Mi, 3=Koli */
  KargoTuru: SuratKargoTuru;
  /** Ödeme tipi: 1=Peşin, 2=Alıcı Ödemeli */
  Odemetipi: SuratOdemeTipi;
  /** Müşteri sipariş numarası (max 50 karakter) */
  OzelKargoTakipNo: string;
  /** Kargo adedi */
  Adet: number;
  /** Bir parçanın desi bilgisi */
  BirimDesi: number;
  /** Bir parçanın kg bilgisi */
  BirimKg: number;
  /** Taşıma şekli: 1=Kara, 2=Uçak, 3=Motor */
  TasimaSekli: SuratTasimaSekli;
  /** Teslim şekli: 1=Adrese, 2=Şubede */
  TeslimSekli: SuratTeslimSekli;
  /** Gönderi şekli: 0=Standart, 5=Bukoli, 8=Pudo */
  GonderiSekli: SuratGonderiSekli;
  /** Pazaryeri mi: 0=Hayır, 1=Evet */
  Pazaryerimi: 0 | 1;
  /** İade mi: 0=Standart, 1=İade */
  Iademi: 0 | 1;

  // ── Kargo bilgileri (Opsiyonel) ──
  /** Referans no (gruplandırma için) */
  ReferansNo?: string;
  /** İrsaliye seri no (kapıdan ödeme için zorunlu, max 5 karakter) */
  IrsaliyeSeriNo?: string;
  /** İrsaliye sıra no (kapıdan ödeme için zorunlu, max 10 karakter) */
  IrsaliyeSiraNo?: string;
  /** Parçalı gönderiler için: "desi:kg:kargoTürüEnum:adet;" formatında */
  KargoIcerigi?: string;
  /** Kapıdan ödeme tahsilat tipi: 1=Nakit, 2=POS */
  KapidanOdemeTahsilatTipi?: SuratKapidanOdemeTahsilatTipi;
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

export interface SuratShipmentInput {
  idempotencyKey: string;
  correlationId: string;
  payload: SuratGonderiPayload;
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
