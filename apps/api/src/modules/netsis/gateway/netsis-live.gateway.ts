import { Injectable } from "@nestjs/common";
import { NetsisArpsClient } from "../clients/netsis-arps.client";
import { NetsisEDocumentClient } from "../clients/netsis-edocument.client";
import { NetsisItemSlipsClient } from "../clients/netsis-item-slips.client";
import { NetsisItemsClient } from "../clients/netsis-items.client";
import { NetsisPublicClient } from "../clients/netsis-public.client";
import { NetsisQueriesClient } from "../clients/netsis-queries.client";
import { NetsisReceiptsClient } from "../clients/netsis-receipts.client";
import { NetsisTransactionsClient } from "../clients/netsis-transactions.client";
import { NETSIS_PATHS } from "../helpers/netsis.constants";
import type { NetsisPingResult } from "../helpers/netsis.types";
import { NetsisHttpClient } from "../http/netsis-http.client";
import type { NetsisGateway } from "./netsis-gateway";

/** Gerçek NetOpenX REST — `NETSIS_MODE=live`. */
@Injectable()
export class NetsisLiveGateway implements NetsisGateway {
  readonly mode = "live" as const;

  constructor(
    readonly arps: NetsisArpsClient,
    readonly items: NetsisItemsClient,
    readonly itemSlips: NetsisItemSlipsClient,
    readonly eDocuments: NetsisEDocumentClient,
    readonly receipts: NetsisReceiptsClient,
    readonly transactions: NetsisTransactionsClient,
    readonly publicApi: NetsisPublicClient,
    readonly queries: NetsisQueriesClient,
    private readonly http: NetsisHttpClient,
  ) {}

  /**
   * Önce kimliksiz uçlar (sunucu ayakta mı, hangi sürüm), sonra ortak
   * oturumla kimlikli ping: ikincisi gerekiyorsa login olur — yani tek bir
   * lisans koltuğu kullanır, yeni bir tane açmaz.
   */
  async ping(): Promise<NetsisPingResult> {
    await this.publicApi.ping();
    const version = await this.publicApi.version();
    await this.http.get(NETSIS_PATHS.ping);
    return { mode: this.mode, version, authenticated: true };
  }
}
