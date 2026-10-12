import { Injectable } from "@nestjs/common";
import type { NetsisPublicApi } from "../gateway/netsis-gateway";
import { NETSIS_PATHS } from "../helpers/netsis.constants";
import {
  asNetsisRecordList,
  readNetsisScalar,
} from "../helpers/netsis-response.helper";
import type { NetsisRawRecord } from "../helpers/netsis.types";
import { NetsisTransport } from "../http/netsis-transport";

/** VERIFY: Version yanıtı düz değer değilse sürümün alanı. */
const VERSION_FIELDS = ["Version", "version", "Result"] as const;

/**
 * Kimliksiz `public/*` uçları — token almaz, lisans koltuğu harcamaz. Bağlantı
 * teşhisi (smoke, sağlık) ve kurulumda doğru şirket/şube adını bulmak için.
 */
@Injectable()
export class NetsisPublicClient implements NetsisPublicApi {
  constructor(private readonly transport: NetsisTransport) {}

  async ping(): Promise<void> {
    await this.transport.send({ method: "GET", path: NETSIS_PATHS.publicPing });
  }

  async version(): Promise<string> {
    const data = await this.transport.send({
      method: "GET",
      path: NETSIS_PATHS.publicVersion,
    });
    return readNetsisScalar(data, VERSION_FIELDS);
  }

  async companyList(): Promise<NetsisRawRecord[]> {
    return asNetsisRecordList(
      await this.transport.send({
        method: "GET",
        path: NETSIS_PATHS.publicCompanyList,
      }),
    );
  }

  async authorizedBranches(
    company: string,
    username: string,
  ): Promise<NetsisRawRecord[]> {
    return asNetsisRecordList(
      await this.transport.send({
        method: "GET",
        path: NETSIS_PATHS.publicAuthorizedBranches,
        query: { company, username },
      }),
    );
  }
}
