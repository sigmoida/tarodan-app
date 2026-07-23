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

@Module({
  imports: [ConfigModule, CacheModule, PrismaModule],
  providers: [
    {
      provide: SURAT_CARRIER_CLIENT,
      useFactory: (config: ConfigService): SuratCarrierClient => {
        // SURAT_SOAP_MODE:
        //   'rest' → RestSuratClient  (dokümandaki REST GonderiyiKargoyaGonder — test/canlı SURAT_KARGO_TEST_MODE ile)
        //   'live' | 'soap' → LiveSuratSoapClient (eski SOAP webservices.asmx)
        //   diğer/boş → StubSuratSoapClient (gerçek çağrı yok)
        const mode = config
          .get<string>("SURAT_SOAP_MODE", "stub")
          ?.trim()
          .toLowerCase();
        if (mode === "rest") return new RestSuratClient(config);
        if (mode === "live" || mode === "soap")
          return new LiveSuratSoapClient(config);
        return new StubSuratSoapClient(config);
      },
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
