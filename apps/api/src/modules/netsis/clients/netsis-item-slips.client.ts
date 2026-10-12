import { Injectable } from "@nestjs/common";
import type { NetsisItemSlipsApi } from "../gateway/netsis-gateway";
import {
  NETSIS_PATHS,
  NETSIS_SLIP_BY_TRACKING_KEY_SQL,
} from "../helpers/netsis.constants";
import {
  readNetsisSlipTotals,
  readNetsisTrackedSlipKey,
} from "../helpers/netsis-model.helper";
import {
  asNetsisRecord,
  netsisPathSegment,
  nullIfNetsisNotFound,
  readNetsisScalar,
  writtenNetsisRecord,
} from "../helpers/netsis-response.helper";
import type {
  NetsisCallOptions,
  NetsisItemSlip,
  NetsisItemSlipKey,
  NetsisSlipTotals,
} from "../helpers/netsis.types";
import { NetsisHttpClient } from "../http/netsis-http.client";
import { NetsisQueriesClient } from "./netsis-queries.client";

/** VERIFY: yeni numara uçlarının yanıtında numaranın taşındığı alan. */
const NUMBER_FIELDS = ["FATIRS_NO", "Number", "BelgeNo", "Result"] as const;
/** VERIFY: HTML uçlarının yanıtı düz metin değilse HTML'in taşındığı alan. */
const HTML_FIELDS = ["Html", "HTML", "Result"] as const;

/**
 * Faturalar (ItemSlips). Gövdeler `netsis.types.ts`'teki tahmini modellerdir;
 * anahtar gerektiren uçlar (Details/Html/Delete) `NetsisItemSlipKey` gönderir.
 * İzleme anahtarıyla arama için ItemSlips'te uç yok: salt okunur `Queries`
 * üzerinden yapılır.
 */
@Injectable()
export class NetsisItemSlipsClient implements NetsisItemSlipsApi {
  constructor(
    private readonly http: NetsisHttpClient,
    private readonly queries: NetsisQueriesClient,
  ) {}

  async create(
    slip: NetsisItemSlip,
    options?: NetsisCallOptions,
  ): Promise<NetsisItemSlip> {
    const data = await this.http.post(NETSIS_PATHS.itemSlips, slip, options);
    return writtenNetsisRecord(data, slip);
  }

  async details(
    key: NetsisItemSlipKey,
    options?: NetsisCallOptions,
  ): Promise<NetsisItemSlip | null> {
    const record = await nullIfNetsisNotFound(
      this.http.post(NETSIS_PATHS.itemSlipDetails, key, options),
    );
    return record as NetsisItemSlip | null;
  }

  async calculate(
    slip: NetsisItemSlip,
    options?: NetsisCallOptions,
  ): Promise<NetsisSlipTotals> {
    const data = await this.http.post(
      NETSIS_PATHS.itemSlipCalculate,
      slip,
      options,
    );
    return readNetsisSlipTotals(asNetsisRecord(data));
  }

  async html(
    key: NetsisItemSlipKey,
    options?: NetsisCallOptions,
  ): Promise<string> {
    const data = await this.http.post(NETSIS_PATHS.itemSlipHtml, key, options);
    return readNetsisScalar(data, HTML_FIELDS);
  }

  /** VERIFY: gövde `{ SERI }` varsayıldı. */
  async newEInvoiceNumber(
    serial: string,
    options?: NetsisCallOptions,
  ): Promise<string> {
    const data = await this.http.post(
      NETSIS_PATHS.itemSlipNewEInvoiceNumber,
      { SERI: serial },
      options,
    );
    return readNetsisScalar(data, NUMBER_FIELDS);
  }

  async newEArchiveNumber(
    serial: string,
    options?: NetsisCallOptions,
  ): Promise<string> {
    const data = await this.http.get(
      `${NETSIS_PATHS.itemSlipNewEArchiveNumber}/${netsisPathSegment(serial)}`,
      undefined,
      options,
    );
    return readNetsisScalar(data, NUMBER_FIELDS);
  }

  /**
   * VERIFY: `DELETE ItemSlips/{id}` yerine `POST ItemSlips/Delete` seçildi —
   * fatura bileşik anahtarlı (tip + numara + cari) ve tek bir {id}'ye
   * sığmayabilir.
   */
  async delete(
    key: NetsisItemSlipKey,
    options?: NetsisCallOptions,
  ): Promise<void> {
    await this.http.post(NETSIS_PATHS.itemSlipDelete, key, options);
  }

  /**
   * Transaction DIŞINDA okur: yalnız commit edilmiş fişler görünür. Birden
   * fazla satır varsa (çift fiş zaten oluşmuş) en küçük numaralı — ilk
   * açılan — döner; fazlası muhasebede elle temizlenir.
   */
  async findByTrackingKey(
    trackingKey: string,
  ): Promise<NetsisItemSlipKey | null> {
    const key = trackingKey.trim();
    // Boş anahtar boş açıklamalı (bizim olmayan) fişlerle eşleşebilirdi.
    if (!key) return null;
    const rows = await this.queries.select(NETSIS_SLIP_BY_TRACKING_KEY_SQL, {
      trackingKey: key,
    });
    return rows.length > 0 ? readNetsisTrackedSlipKey(rows[0]) : null;
  }
}
