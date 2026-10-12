import { Injectable, Logger } from "@nestjs/common";
import type { NetsisTransactionsApi } from "../gateway/netsis-gateway";
import { NETSIS_PATHS } from "../helpers/netsis.constants";
import { readNetsisScalar } from "../helpers/netsis-response.helper";
import { runInNetsisTransaction } from "../helpers/netsis-transaction.helper";
import type { NetsisTransactionContext } from "../helpers/netsis.types";
import { classifyNetsisError } from "../http/netsis-error";
import { NetsisHttpClient } from "../http/netsis-http.client";

/** VERIFY: OpenTransaction yanıtı düz değer değilse transId'nin alanı. */
const TRANSACTION_ID_FIELDS = ["transId", "TransId", "TRANSID", "Id"] as const;

/**
 * NetOpenX transaction'ları: birden çok yazmayı (cari + fatura + tahsilat)
 * tek birim olarak commit/rollback etmek için.
 *
 * Dikkat (VERIFY): oturum tüm süreçlerce PAYLAŞILIYOR. Transaction'ın
 * oturum kapsamlı olup olmadığı — yani başka bir sürecin aynı token'la
 * yaptığı yazmanın açık transaction'a karışıp karışmadığı — danışmana
 * sorulacak; karışıyorsa transaction'lı akışlar tek bir worker'a alınmalı.
 */
@Injectable()
export class NetsisTransactionsClient implements NetsisTransactionsApi {
  private readonly logger = new Logger(NetsisTransactionsClient.name);

  constructor(private readonly http: NetsisHttpClient) {}

  async open(): Promise<string> {
    const data = await this.http.get(NETSIS_PATHS.openTransaction);
    return readNetsisScalar(data, TRANSACTION_ID_FIELDS);
  }

  async commit(transactionId: string): Promise<void> {
    await this.http.get(
      NETSIS_PATHS.commitTransaction,
      { transId: transactionId },
      { transactionId },
    );
  }

  async rollback(transactionId: string): Promise<void> {
    await this.http.get(
      NETSIS_PATHS.rollbackTransaction,
      { transId: transactionId },
      { transactionId },
    );
  }

  withTransaction<T>(
    fn: (tx: NetsisTransactionContext) => Promise<T>,
  ): Promise<T> {
    return runInNetsisTransaction(this, fn, (error) =>
      this.logger.warn(
        `Netsis rollback failed (${classifyNetsisError(error)}); the transaction may stay open until Netsis times it out`,
      ),
    );
  }
}
