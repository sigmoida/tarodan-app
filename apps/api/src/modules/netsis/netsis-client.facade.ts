import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { NetsisConfig, NetsisMode } from "../../config/netsis";
import { i18nMessage } from "../i18n/localized-message";
import type {
  NetsisArpsApi,
  NetsisEDocumentApi,
  NetsisGateway,
  NetsisItemSlipsApi,
  NetsisItemsApi,
  NetsisPublicApi,
  NetsisQueriesApi,
  NetsisReceiptsApi,
  NetsisTransactionsApi,
} from "./gateway/netsis-gateway";
import { NETSIS_CONFIG, NETSIS_GATEWAY } from "./helpers/netsis.constants";
import type { NetsisPingResult } from "./helpers/netsis.types";

/**
 * Diğer modüllerin enjekte edeceği TEK Netsis girişi. Arkasındaki gateway
 * `NETSIS_MODE`'a göre canlı ya da stub'dır; çağıran farkı bilmez.
 *
 * `NETSIS_ENABLED=false` iken her erişim yerelleştirilmiş 503 ile durur: kapalı
 * bir entegrasyonun stub'a sessizce düşüp "fatura kesildi" demesi, eLogo'dan
 * geçiş sırasında iki sistemin birden fatura kesmesine ya da hiçbirinin
 * kesmemesine yol açardı. Çağıran önce `enabled`'a bakmalı.
 */
@Injectable()
export class NetsisClientFacade implements NetsisGateway {
  constructor(
    @Inject(NETSIS_GATEWAY) private readonly gateway: NetsisGateway,
    @Inject(NETSIS_CONFIG) private readonly config: NetsisConfig,
  ) {}

  get enabled(): boolean {
    return this.config.enabled;
  }

  get mode(): NetsisMode {
    return this.gateway.mode;
  }

  get arps(): NetsisArpsApi {
    return this.ready().arps;
  }

  get items(): NetsisItemsApi {
    return this.ready().items;
  }

  get itemSlips(): NetsisItemSlipsApi {
    return this.ready().itemSlips;
  }

  get eDocuments(): NetsisEDocumentApi {
    return this.ready().eDocuments;
  }

  get receipts(): NetsisReceiptsApi {
    return this.ready().receipts;
  }

  get transactions(): NetsisTransactionsApi {
    return this.ready().transactions;
  }

  get publicApi(): NetsisPublicApi {
    return this.ready().publicApi;
  }

  get queries(): NetsisQueriesApi {
    return this.ready().queries;
  }

  ping(): Promise<NetsisPingResult> {
    return this.ready().ping();
  }

  private ready(): NetsisGateway {
    if (!this.config.enabled) {
      throw new ServiceUnavailableException(
        i18nMessage("server.netsis.disabled"),
      );
    }
    return this.gateway;
  }
}
