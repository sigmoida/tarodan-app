import { Injectable } from "@nestjs/common";
import type { NetsisArpsApi } from "../gateway/netsis-gateway";
import { NETSIS_PATHS } from "../helpers/netsis.constants";
import {
  asNetsisRecord,
  writtenNetsisRecord,
  netsisPathSegment,
  nullIfNetsisNotFound,
} from "../helpers/netsis-response.helper";
import type {
  NetsisArp,
  NetsisCallOptions,
  NetsisRawRecord,
} from "../helpers/netsis.types";
import { NetsisHttpClient } from "../http/netsis-http.client";

/**
 * Cari kartları (ARPs). VERIFY: `ARPs/{id}`'deki id'nin `CARI_KOD` olduğu
 * varsayıldı; sayısal bir iç id çıkarsa arama `q` filtresine döner.
 */
@Injectable()
export class NetsisArpsClient implements NetsisArpsApi {
  constructor(private readonly http: NetsisHttpClient) {}

  async findByCode(
    code: string,
    options?: NetsisCallOptions,
  ): Promise<NetsisArp | null> {
    const record = await nullIfNetsisNotFound(
      this.http.get(this.recordPath(code), undefined, options),
    );
    return record as NetsisArp | null;
  }

  async create(arp: NetsisArp, options?: NetsisCallOptions): Promise<NetsisArp> {
    const data = await this.http.post(NETSIS_PATHS.arps, arp, options);
    return writtenNetsisRecord(data, arp);
  }

  async update(
    code: string,
    arp: NetsisArp,
    options?: NetsisCallOptions,
  ): Promise<NetsisArp> {
    const data = await this.http.put(this.recordPath(code), arp, options);
    return writtenNetsisRecord(data, arp);
  }

  /** VERIFY: gövde şekli (`CARI_KOD` alanı mı, liste mi) bilinmiyor. */
  async refreshEInvoiceFlags(
    code?: string,
    options?: NetsisCallOptions,
  ): Promise<NetsisRawRecord> {
    const data = await this.http.post(
      NETSIS_PATHS.eDocumentCurrentUpdate,
      code ? { CARI_KOD: code } : {},
      options,
    );
    return data === null ? {} : asNetsisRecord(data);
  }

  private recordPath(code: string): string {
    return `${NETSIS_PATHS.arps}/${netsisPathSegment(code)}`;
  }
}
