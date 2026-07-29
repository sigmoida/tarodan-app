import type {
  SuratShipmentInput,
  SuratBarcodeResult,
} from "./surat-cargo.types";

/** DI token — Faz 11.5a: tüketiciler somut SuratCargoService yerine bu soyutlamaya bağlanır. */
export const CARGO_PROVIDER = Symbol("CARGO_PROVIDER");

/**
 * CargoProvider (Faz 11.5a) — kargo sağlayıcısı soyutlaması (DIP). Payment bu arayüze
 * bağlanır; sağlayıcı değişse çağıran etkilenmez. (Girdi/çıktı değer-tipleri şimdilik
 * Sürat'tan; servis bağımlılığı ters çevrildi.)
 */
export interface CargoProvider {
  isIntegrationEnabled(): boolean;
  createShipmentWithBarcode(
    input: SuratShipmentInput,
  ): Promise<SuratBarcodeResult>;
  cancelShipmentByOrderNumber(
    ozelKargoTakipNo: string,
  ): Promise<{ ok: boolean; suratMessage?: string }>;
}
