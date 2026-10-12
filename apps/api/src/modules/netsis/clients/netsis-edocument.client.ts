import { Injectable } from "@nestjs/common";
import type { NetsisEDocumentApi } from "../gateway/netsis-gateway";
import { NETSIS_PATHS } from "../helpers/netsis.constants";
import {
  readNetsisEDocumentState,
  readNetsisEttn,
} from "../helpers/netsis-model.helper";
import {
  isNetsisRecord,
  readNetsisScalar,
} from "../helpers/netsis-response.helper";
import type {
  NetsisCallOptions,
  NetsisEDocumentRequest,
  NetsisEDocumentSendResult,
  NetsisEDocumentStatus,
  NetsisRawRecord,
} from "../helpers/netsis.types";
import { NetsisHttpClient } from "../http/netsis-http.client";

/** VERIFY: ShowEDocument yanıtı düz metin değilse HTML'in taşındığı alan. */
const HTML_FIELDS = ["Html", "HTML", "Result"] as const;

/**
 * e-Belge (EDocument): Netsis'te kayıtlı bir faturayı e-Fatura/e-Arşiv olarak
 * GİB'e (entegratör üzerinden) gönderir, durumunu tazeler, iptal eder.
 * Gövde `NetsisEDocumentRequest` — hangi faturanın kastedildiği (VERIFY).
 */
@Injectable()
export class NetsisEDocumentClient implements NetsisEDocumentApi {
  constructor(private readonly http: NetsisHttpClient) {}

  async send(
    request: NetsisEDocumentRequest,
    options?: NetsisCallOptions,
  ): Promise<NetsisEDocumentSendResult> {
    const raw = this.record(
      await this.http.post(NETSIS_PATHS.eDocumentSend, request, options),
    );
    return { ettn: readNetsisEttn(raw), raw };
  }

  async check(
    request: NetsisEDocumentRequest,
    options?: NetsisCallOptions,
  ): Promise<NetsisEDocumentStatus> {
    const raw = this.record(
      await this.http.post(NETSIS_PATHS.eDocumentCheck, request, options),
    );
    return {
      state: readNetsisEDocumentState(raw),
      ettn: readNetsisEttn(raw) ?? request.ETTN ?? null,
      raw,
    };
  }

  async cancelEArchive(
    request: NetsisEDocumentRequest,
    options?: NetsisCallOptions,
  ): Promise<void> {
    await this.http.post(NETSIS_PATHS.eDocumentCancelEArchive, request, options);
  }

  async show(
    request: NetsisEDocumentRequest,
    options?: NetsisCallOptions,
  ): Promise<string> {
    const data = await this.http.post(
      NETSIS_PATHS.eDocumentShow,
      request,
      options,
    );
    return readNetsisScalar(data, HTML_FIELDS);
  }

  /**
   * Bu uçların yanıt şekli bilinmiyor (VERIFY): nesne olduğu gibi, düz değer
   * `{ Result }` içinde tutulur ki `raw` hiç kaybolmasın.
   */
  private record(data: unknown): NetsisRawRecord {
    if (isNetsisRecord(data)) return data;
    return data === null ? {} : { Result: data };
  }
}
