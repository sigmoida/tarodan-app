/** Uygulama katmanının somut kargo sağlayıcısından bağımsız DI sınırı. */
export const CARGO_PROVIDER = Symbol("CARGO_PROVIDER");

export interface CargoRecipient {
  name: string;
  address: string;
  city: string;
  district: string;
  phone: string;
}

export interface CargoShipmentRequest {
  idempotencyKey: string;
  correlationId: string;
  reference: string;
  recipient: CargoRecipient;
  content?: string;
  desi?: number | null;
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
