import type { ConfigService } from "@nestjs/config";

/**
 * PayTR rapor senkronu bayrağı — TEK okuma noktası. Rapor uçları PayTR panelinde
 * ayrı yetki ister; bayrak kapalıyken ne senkron istek atar ne de mutabakat
 * ekranı "veri yok"u "senkron kapalı"dan ayırt edemez hâlde kalır.
 */
export function paytrReportSyncEnabled(config: ConfigService): boolean {
  return config.get<string>("PAYTR_REPORT_SYNC_ENABLED") === "true";
}
