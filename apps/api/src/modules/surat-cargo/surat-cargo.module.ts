import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { CacheModule } from "../cache/cache.module";
import { PrismaModule } from "../../prisma";
import { NotificationModule } from "../notification/notification.module";
import { SuratCargoService, SURAT_CARRIER_CLIENT } from "./surat-cargo.service";
import { SuratTrackingService } from "./sync/surat-tracking.service";
import { SuratTrackingClient } from "./clients/surat-tracking.client";
import { OrderTrackingSyncService } from "./sync/order-tracking-sync.service";
import { TradeTrackingSyncService } from "./sync/trade-tracking-sync.service";
import { RefundReturnTrackingSyncService } from "./sync/refund-return-tracking-sync.service";
import { BarcodeRetryService } from "./sync/barcode-retry.service";
import { CargoAlertingService } from "./sync/cargo-alerting.service";
import { CARGO_PROVIDER } from "./helpers/cargo-provider";
import {
  StubSuratSoapClient,
  SuratCarrierClient,
} from "./clients/surat-soap.client";
import { RestSuratClient } from "./clients/surat-rest.client";
import { OrderShipmentProvisioner } from "./sync/order-shipment-provisioner.service";
import { CarrierCancellationService } from "./sync/carrier-cancellation.service";

/**
 * SURAT_SOAP_MODE → taşıyıcı client seçimi (geriye dönük env adı korunuyor):
 *   'rest' → RestSuratClient (yalnız resmi GonderiyiKargoyaGonder)
 *   'stub' / boş → StubSuratSoapClient (yerel, ağ çağrısı yok)
 *   diğer değerler → reddedilir; sistem yalnız belgelenmiş REST sözleşmesini kullanır.
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
  if (mode === "live" || mode === "soap") {
    throw new Error(
      `FATAL: SURAT_SOAP_MODE='${mode}' artık desteklenmiyor. ` +
        `Sürat entegrasyonu yalnız resmi REST GonderiyiKargoyaGonder ve ` +
        `KargoTakipHareketDetayi endpoint'lerini kullanır; 'rest' seçin.`,
    );
  }

  const isProduction =
    (config.get<string>("NODE_ENV") ?? "").trim() === "production";
  const cargoEnabled = ["true", "1"].includes(
    (config.get<string>("SURAT_CARGO_ENABLED", "false") ?? "").trim(),
  );
  if (isProduction && cargoEnabled && mode !== "rest") {
    throw new Error(
      `FATAL: SURAT_CARGO_ENABLED=true ancak SURAT_SOAP_MODE gerçek bir ` +
        `taşıyıcı moduna ayarlı değil (mevcut="${mode}"). Production'da ` +
        `'rest' olmalı — stub sahte kargo başarısı üretir.`,
    );
  }

  if (mode === "rest") return new RestSuratClient(config);
  return new StubSuratSoapClient(config);
}

@Module({
  // NotificationModule: adressiz satıcıya "çıkış adresi ekle" bildirimi
  // (OrderShipmentProvisioner). Leaf modül — döngü yok.
  imports: [ConfigModule, CacheModule, PrismaModule, NotificationModule],
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
    OrderShipmentProvisioner,
    CarrierCancellationService,
    // Faz 11.5a (DIP): CARGO_PROVIDER token → aynı SuratCargoService singleton'ına
    // bağlanır; tüketiciler (ör. Payment) somut servis yerine bu soyutlamayı enjekte eder.
    { provide: CARGO_PROVIDER, useExisting: SuratCargoService },
  ],
  exports: [
    SuratCargoService,
    SuratTrackingService,
    OrderShipmentProvisioner,
    CarrierCancellationService,
    CARGO_PROVIDER,
  ],
})
export class SuratCargoModule {}
