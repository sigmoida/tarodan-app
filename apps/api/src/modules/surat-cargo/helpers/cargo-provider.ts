/** Uygulama katmanının somut kargo sağlayıcısından bağımsız DI sınırı. */
export const CARGO_PROVIDER = Symbol("CARGO_PROVIDER");

/**
 * Bir gönderinin taraflarından biri. Gönderici ve alıcı AYNI şekle sahiptir —
 * çünkü taşıyıcı ikisinden de aynı bilgileri ister ve bir iade, alanları farklı
 * doldurmak değil, iki tarafı yer değiştirmektir.
 */
export interface CargoParty {
  name: string;
  address: string;
  city: string;
  district: string;
  phone: string;
  /** Taşıyıcı için opsiyonel; misafir siparişte bulunmayabilir. */
  email?: string;
  /**
   * Bu tarafın bizim sistemimizdeki kalıcı müşteri anahtarı (`User.adminCode`,
   * ya da depo/test için sabit kod) — taşıyıcının `MusteriId` alanına gider.
   * Opsiyonel: misafir siparişinde kimseyi göstermez, o zaman mapper gönderi
   * referansına düşer. Ayrıntı: `helpers/cargo-customer-id.ts`.
   */
  customerId?: string;
}

export interface CargoShipmentRequest {
  idempotencyKey: string;
  correlationId: string;
  reference: string;
  /**
   * Koliyi fiilen gönderen taraf: satışta satıcı, iadede alıcı, takasın depoya
   * giriş bacağında kullanıcı, çıkış bacağında depo. Zorunludur — eskiden
   * gönderici diye bir alan yoktu ve her koli taşıyıcıda kurumsal cari
   * hesabımızın üstüne açılıyordu.
   */
  sender: CargoParty;
  recipient: CargoParty;
  content?: string;
  desi?: number | null;
  /**
   * Kolinin bir iade bacağı olduğu. Taşıyıcıya giden bir alan DEĞİL — yön
   * `sender`/`recipient` ile ifade edilir; bu bayrak yalnız kendi kayıt ve
   * raporlama tarafımız için taşınır.
   */
  isReturn?: boolean;
}

export type CargoShipmentResult =
  | {
      ok: true;
      /** Taşıyıcının gerçek takip kodu; şube kabulünden önce henüz null olabilir. */
      trackingCode: string | null;
      labelData: string | null;
      providerMessage?: string;
    }
  | {
      ok: false;
      kind: "business";
      message: string;
    }
  | {
      ok: false;
      kind: "technical";
      code: string;
      cause?: Error;
    };

export type CargoShipmentFailure = Exclude<CargoShipmentResult, { ok: true }>;

export interface CargoLocalCancellationResult {
  ok: boolean;
  providerMessage?: string;
}

/**
 * Provider-neutral port. Sürat REST alanları ve yanıt adları yalnız adaptörün
 * içinde kalır; payment/order/trade/refund katmanlarına sızmaz.
 */
export interface CargoProvider {
  isEnabled(): boolean;
  createShipment(input: CargoShipmentRequest): Promise<CargoShipmentResult>;
  clearLocalShipment(reference: string): Promise<CargoLocalCancellationResult>;
}
