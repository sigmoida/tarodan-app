import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { CacheModule } from "../cache/cache.module";
import { PrismaModule } from "../../prisma";
import { SuratCargoService, SURAT_CARRIER_CLIENT } from "./surat-cargo.service";
import { SuratTrackingService } from "./surat-tracking.service";
import { SuratTrackingClient } from "./surat-tracking.client";
import { OrderTrackingSyncService } from "./order-tracking-sync.service";
import { TradeTrackingSyncService } from "./trade-tracking-sync.service";
import { RefundReturnTrackingSyncService } from "./refund-return-tracking-sync.service";
import { BarcodeRetryService } from "./barcode-retry.service";
import { CargoAlertingService } from "./cargo-alerting.service";
import { CARGO_PROVIDER } from "./cargo-provider";
import {
  StubSuratSoapClient,
  LiveSuratSoapClient,
  SuratCarrierClient,
} from "./surat-soap.client";
import { RestSuratClient } from "./surat-rest.client";

/**
 * SURAT_SOAP_MODE → taşıyıcı client seçimi (test edilebilir olsun diye export):
 *   'rest' → RestSuratClient  (dokümandaki REST GonderiyiKargoyaGonder — test/canlı SURAT_KARGO_TEST_MODE ile)
 *   'live' | 'soap' → LiveSuratSoapClient (eski SOAP webservices.asmx)
 *   diğer/boş → StubSuratSoapClient (gerçek çağrı yok)
 *
 * Fail-fast: production'da kargo ENTEGRASYONU AÇIKken gerçek bir taşıyıcı modu
 * ZORUNLUDUR. Aksi halde stub sessizce devreye girer (sahte başarı + sahte takip
 * kodu) → siparişler "kargolandı" görünür ama Sürat'ta fiziksel gönderi HİÇ oluşmaz.
 * Boot'ta patlayarak yanlış-konfigli üretimi engelle.
 */
export function resolveSuratCarrierClient(
  config: ConfigService,
): SuratCarrierClient {
  const mode = config
    .get<string>("SURAT_SOAP_MODE", "stub")
    ?.trim()
    .toLowerCase();
  const isRealMode = mode === "rest" || mode === "live" || mode === "soap";

  const isProduction =
    (config.get<string>("NODE_ENV") ?? "").trim() === "production";
  const cargoEnabled = ["true", "1"].includes(
    (config.get<string>("SURAT_CARGO_ENABLED", "false") ?? "").trim(),
  );
  if (isProduction && cargoEnabled && !isRealMode) {
    throw new Error(
      `FATAL: SURAT_CARGO_ENABLED=true ancak SURAT_SOAP_MODE gerçek bir ` +
        `taşıyıcı moduna ayarlı değil (mevcut="${mode}"). Production'da ` +
        `'rest' | 'live' | 'soap' olmalı — stub sahte kargo başarısı üretir.`,
    );
  }

  if (mode === "rest") return new RestSuratClient(config);
  if (mode === "live" || mode === "soap")
    return new LiveSuratSoapClient(config);
  return new StubSuratSoapClient(config);
}

@Module({
  imports: [ConfigModule, CacheModule, PrismaModule],
  providers: [
    {
      provide: SURAT_CARRIER_CLIENT,
      useFactory: resolveSuratCarrierClient,
      inject: [ConfigService],
    },
    SuratCargoService,
    SuratTrackingService,
    // Faz 11.3a: SuratTrackingService (facade) + tek-sorumluluklu alt servisler.
    SuratTrackingClient,
    OrderTrackingSyncService,
    TradeTrackingSyncService,
    RefundReturnTrackingSyncService,
    BarcodeRetryService,
    CargoAlertingService,
    // Faz 11.5a (DIP): CARGO_PROVIDER token → aynı SuratCargoService singleton'ına
    // bağlanır; tüketiciler (ör. Payment) somut servis yerine bu soyutlamayı enjekte eder.
    { provide: CARGO_PROVIDER, useExisting: SuratCargoService },
  ],
  exports: [SuratCargoService, SuratTrackingService, CARGO_PROVIDER],
})
export class SuratCargoModule {}
