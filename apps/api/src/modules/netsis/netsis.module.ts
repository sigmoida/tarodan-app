import { Module } from "@nestjs/common";
import { netsisConfig, type NetsisConfig } from "../../config/netsis";
import { NetsisArpsClient } from "./clients/netsis-arps.client";
import { NetsisEDocumentClient } from "./clients/netsis-edocument.client";
import { NetsisItemSlipsClient } from "./clients/netsis-item-slips.client";
import { NetsisItemsClient } from "./clients/netsis-items.client";
import { NetsisPublicClient } from "./clients/netsis-public.client";
import { NetsisQueriesClient } from "./clients/netsis-queries.client";
import { NetsisReceiptsClient } from "./clients/netsis-receipts.client";
import { NetsisTransactionsClient } from "./clients/netsis-transactions.client";
import type { NetsisGateway } from "./gateway/netsis-gateway";
import { NetsisLiveGateway } from "./gateway/netsis-live.gateway";
import { NetsisStubGateway } from "./gateway/netsis-stub.gateway";
import { NETSIS_CONFIG, NETSIS_GATEWAY } from "./helpers/netsis.constants";
import { NetsisHttpClient } from "./http/netsis-http.client";
import { NetsisTransport } from "./http/netsis-transport";
import { NetsisClientFacade } from "./netsis-client.facade";
import { NetsisSessionService } from "./session/netsis-session.service";

/**
 * Logo Netsis (NetOpenX REST) entegrasyonu — eLogo'nun yerini alacak.
 *
 * Şimdilik BAĞIMSIZ: hiçbir modül bunu import etmiyor, faturalama hâlâ
 * eLogo'dan. Dışarıya yalnız `NetsisClientFacade` açılır; arkasındaki gateway
 * `NETSIS_MODE`'a göre (Sürat/eLogo'daki gibi factory ile) canlı ya da stub'dır.
 * Oturum Redis'te paylaşıldığı için `CacheService` gerekir (CacheModule global).
 * Ayrıntı: docs/NETSIS.md.
 */
@Module({
  providers: [
    { provide: NETSIS_CONFIG, useFactory: (): NetsisConfig => netsisConfig() },
    NetsisTransport,
    NetsisSessionService,
    NetsisHttpClient,
    NetsisArpsClient,
    NetsisItemsClient,
    NetsisItemSlipsClient,
    NetsisEDocumentClient,
    NetsisReceiptsClient,
    NetsisTransactionsClient,
    NetsisPublicClient,
    NetsisQueriesClient,
    NetsisLiveGateway,
    NetsisStubGateway,
    {
      provide: NETSIS_GATEWAY,
      useFactory: (
        config: NetsisConfig,
        live: NetsisLiveGateway,
        stub: NetsisStubGateway,
      ): NetsisGateway => (config.mode === "live" ? live : stub),
      inject: [NETSIS_CONFIG, NetsisLiveGateway, NetsisStubGateway],
    },
    NetsisClientFacade,
  ],
  exports: [NetsisClientFacade],
})
export class NetsisModule {}
