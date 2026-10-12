import { Injectable } from "@nestjs/common";
import type { NetsisReceiptsApi } from "../gateway/netsis-gateway";
import { NETSIS_PATHS } from "../helpers/netsis.constants";
import {
  netsisPathSegment,
  nullIfNetsisNotFound,
  writtenNetsisRecord,
} from "../helpers/netsis-response.helper";
import type {
  NetsisBankTransfer,
  NetsisCallOptions,
  NetsisMixedReceipt,
} from "../helpers/netsis.types";
import { NetsisHttpClient } from "../http/netsis-http.client";

/**
 * Tahsilat ve banka hareketleri: hızlı tahsilat fişi (MixedReceiptsMain —
 * müşteriden alınan ödeme) ve havale/EFT/virman (BankRemittanceTransfer —
 * satıcıya yapılan ödeme). Modeller tahmini (VERIFY).
 */
@Injectable()
export class NetsisReceiptsClient implements NetsisReceiptsApi {
  constructor(private readonly http: NetsisHttpClient) {}

  async createCollection(
    receipt: NetsisMixedReceipt,
    options?: NetsisCallOptions,
  ): Promise<NetsisMixedReceipt> {
    const data = await this.http.post(
      NETSIS_PATHS.mixedReceipts,
      receipt,
      options,
    );
    return writtenNetsisRecord(data, receipt);
  }

  async getCollection(
    id: string,
    options?: NetsisCallOptions,
  ): Promise<NetsisMixedReceipt | null> {
    const record = await nullIfNetsisNotFound(
      this.http.get(
        `${NETSIS_PATHS.mixedReceipts}/${netsisPathSegment(id)}`,
        undefined,
        options,
      ),
    );
    return record as NetsisMixedReceipt | null;
  }

  async createBankTransfer(
    transfer: NetsisBankTransfer,
    options?: NetsisCallOptions,
  ): Promise<NetsisBankTransfer> {
    const data = await this.http.post(
      NETSIS_PATHS.bankRemittanceTransfer,
      transfer,
      options,
    );
    return writtenNetsisRecord(data, transfer);
  }
}
