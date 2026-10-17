import { Injectable } from "@nestjs/common";
import type { NetsisItemsApi } from "../gateway/netsis-gateway";
import { NETSIS_PATHS } from "../helpers/netsis.constants";
import { ensureNetsisItem } from "../helpers/netsis-ensure-item.helper";
import {
  netsisPathSegment,
  nullIfNetsisNotFound,
  writtenNetsisRecord,
} from "../helpers/netsis-response.helper";
import type { NetsisCallOptions, NetsisItem } from "../helpers/netsis.types";
import { NetsisHttpClient } from "../http/netsis-http.client";

/**
 * Stok/hizmet kartları (Items). Pazaryeri hizmetleri (komisyon, kargo,
 * ilan paketi…) Netsis'te birer hizmet kartıdır. VERIFY: `Items/{id}`'deki
 * id'nin `STOK_KODU` olduğu varsayıldı.
 */
@Injectable()
export class NetsisItemsClient implements NetsisItemsApi {
  constructor(private readonly http: NetsisHttpClient) {}

  async findByCode(
    code: string,
    options?: NetsisCallOptions,
  ): Promise<NetsisItem | null> {
    const record = await nullIfNetsisNotFound(
      this.http.get(
        `${NETSIS_PATHS.items}/${netsisPathSegment(code)}`,
        undefined,
        options,
      ),
    );
    return record as NetsisItem | null;
  }

  async create(
    item: NetsisItem,
    options?: NetsisCallOptions,
  ): Promise<NetsisItem> {
    const data = await this.http.post(NETSIS_PATHS.items, item, options);
    return writtenNetsisRecord(data, item);
  }

  ensureServiceItem(
    item: NetsisItem,
    options?: NetsisCallOptions,
  ): Promise<NetsisItem> {
    return ensureNetsisItem(this, item, options);
  }
}
