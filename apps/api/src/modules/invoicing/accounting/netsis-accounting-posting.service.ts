import { Injectable, Logger, Optional } from "@nestjs/common";
import {
  NetsisSyncStatus,
  Prisma,
  type NetsisSyncRecord,
} from "@prisma/client";
import { adminUrl } from "../../../config/app-urls";
import { PrismaService } from "../../../prisma";
import { translateMessage } from "../../i18n/translate";
import {
  NetsisClientFacade,
  describeNetsisError,
  netsisSlipKey,
  readNetsisRecordRef,
} from "../../netsis";
import { NotificationType } from "../../notification/dto";
import { NotificationService } from "../../notification/notification.service";
import { loadNetsisInvoiceSettings } from "../provider/netsis-invoice-settings";
import { parseNetsisProviderRef } from "../provider/netsis-slip.mapper";
import {
  NetsisAccountingMappingError,
  buildNetsisAccountingPosting,
  type NetsisAccountingSource,
} from "./netsis-accounting-mapper";
import {
  loadNetsisAccountingSettings,
  netsisAccountingActive,
  netsisAccountingSettingsReadiness,
  type NetsisAccountingSettings,
} from "./netsis-accounting-settings";
import {
  NetsisAccountingSourceService,
  type LoadedInvoiceCollectionSource,
  type LoadedNetsisAccountingSource,
} from "./netsis-accounting-source.service";
import {
  NETSIS_SYNC_LEASE_MS,
  NETSIS_SYNC_MAX_ATTEMPTS,
  netsisSyncFailureOutcome,
  type NetsisSyncFailureOutcome,
} from "./netsis-sync-failure-policy";

/** Netsis yanıtında kaydın anahtarı yoksa saklanan yerel referansın öneki. */
export const NETSIS_SYNC_LOCAL_REF_PREFIX = "tarodan:";

/** `netsisRef` yazımı geçici bir DB hatasında kaç kez denenir. */
const REF_WRITE_ATTEMPTS = 3;

export interface NetsisAccountingRunResult {
  /**
   * `inactive`: senkron kapalı ya da sağlayıcı Netsis değil; `netsisDisabled`:
   * `NETSIS_ENABLED=false`; `notReady`: zorunlu hesap kodu eksik; `ran`: denendi.
   */
  state: "inactive" | "netsisDisabled" | "notReady" | "ran";
  synced: number;
  failed: number;
  blockers?: string[];
}

/** Kayıt Netsis'te OLUŞTU ama `netsisRef` yerelde saklanamadı. */
class NetsisSyncRefLostError extends Error {
  constructor(readonly ref: string) {
    super(`netsisRef could not be persisted: ${ref}`);
    this.name = "NetsisSyncRefLostError";
  }
}

const message = (key: string, values?: Record<string, string>): string =>
  translateMessage(`server.netsis.accounting.${key}`, "tr", values);

/**
 * Muhasebe senkronunun YAZAN tarafı (yalnız cron'dan çağrılır, worker rolü):
 * bekleyen iş kayıtlarını kira (lease) ile sahiplenir, kaynağı okuyup Netsis
 * kaydını kurar, Netsis'e yazar ve sonucu saklar.
 *
 * Çift kayıt koruması — Netsis tahsilat/havale yazmanın idempotency anahtarı
 * olmadığı için sıralama önemlidir:
 *  1. Sahiplenme `payload`'ı temizler; gövde gönderimden ÖNCE yazılır. Kirası
 *     dolmuş bir `processing` satırında `payload` doluysa önceki deneme
 *     gönderime başlamış olabilir → sonuç bilinmiyor, otomatik denenmez.
 *  2. Netsis'te kayıt oluşunca anahtarı (`netsisRef`) HEMEN, durumdan ÖNCE ve
 *     ayrı bir yazımla saklanır. Dolu `netsisRef` "zaten var" demektir:
 *     sonraki deneme Netsis'e gitmeden `synced` işaretler.
 *  3. Gönderim sonucu bilinmeyen hata (zaman aşımı, kopma, 5xx) satırı
 *     bütçesi bitmiş `failed`'e çeker ve alarm üretir; admin Netsis'te izleme
 *     anahtarıyla bakıp ya eşleştirir ya da yeniden dener.
 */
@Injectable()
export class NetsisAccountingPostingService {
  private readonly logger = new Logger(NetsisAccountingPostingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly netsis: NetsisClientFacade,
    private readonly sources: NetsisAccountingSourceService,
    // Tükenen kayıtlar admin'e in-app alarm olarak düşer; birim testlerinde yok.
    @Optional() private readonly notifications?: NotificationService,
  ) {}

  /** Cron: bekleyen, başarısız (bütçesi olan) ve kirası düşmüş kayıtları yazar. */
  async runPending(batch = 50): Promise<NetsisAccountingRunResult> {
    const settings = await loadNetsisAccountingSettings(this.prisma);
    if (!netsisAccountingActive(settings)) {
      return { state: "inactive", synced: 0, failed: 0 };
    }
    if (!this.netsis.enabled) {
      return { state: "netsisDisabled", synced: 0, failed: 0 };
    }
    // Hesap kodu yoksa hiçbir kayıt denenmez: bütçe yakılmaz, admin ekranı
    // eksiği gösterir, kodlar girilince kayıtlar kendiliğinden akar.
    const blockers = netsisAccountingSettingsReadiness(settings);
    if (blockers.length > 0) {
      this.logger.warn(
        `Netsis muhasebe senkronu bekliyor — eksik ayar: ${blockers.join(", ")}`,
      );
      return { state: "notReady", synced: 0, failed: 0, blockers };
    }

    const staleBefore = new Date(Date.now() - NETSIS_SYNC_LEASE_MS);
    const candidates = await this.prisma.netsisSyncRecord.findMany({
      where: {
        OR: [
          { status: NetsisSyncStatus.pending },
          {
            status: NetsisSyncStatus.failed,
            attemptCount: { lt: NETSIS_SYNC_MAX_ATTEMPTS },
          },
          {
            status: NetsisSyncStatus.processing,
            lastAttemptAt: { lt: staleBefore },
          },
        ],
      },
      orderBy: { createdAt: "asc" },
      take: batch,
      select: { id: true },
    });

    let synced = 0;
    let failed = 0;
    for (const { id } of candidates) {
      const status = await this.post(id, settings).catch((error: unknown) => {
        this.logger.error(
          `Netsis muhasebe kaydı işlenemedi (${id}): ${describeNetsisError(error)}`,
        );
        return null;
      });
      if (status === NetsisSyncStatus.synced) synced++;
      if (status === NetsisSyncStatus.failed) failed++;
    }
    return { state: "ran", synced, failed };
  }

  /** Tek kaydı yazar; sahiplenemezse (başkası işliyor / bitmiş) `null`. */
  async post(
    recordId: string,
    preloaded?: NetsisAccountingSettings,
  ): Promise<NetsisSyncStatus | null> {
    const claimed = await this.claim(recordId);
    if (!claimed) return null;
    const { record, sendMayHaveStarted } = claimed;

    // Önceki deneme Netsis'te kaydı oluşturdu, yalnız durum yazılamadı.
    if (record.netsisRef) return this.markSynced(record.id, record.netsisRef);
    if (sendMayHaveStarted) {
      return this.fail(record, "unknown", this.outcomeUnknownText(record));
    }

    let phase: "prepare" | "send" = "prepare";
    try {
      const load = await this.sources.load(record.kind, record.sourceId);
      if (load.state !== "ready") return this.skip(record, load.reason);

      const settings =
        preloaded ?? (await loadNetsisAccountingSettings(this.prisma));
      const { retailCariCode } = await loadNetsisInvoiceSettings(this.prisma);
      const posting = buildNetsisAccountingPosting(
        await this.resolveSource(load.source),
        { accounts: settings.accounts, retailCariCode },
        record.idempotencyKey,
      );

      // Gövde gönderimden ÖNCE: destek ne gittiğini görür, çöken deneme
      // "gönderime başlamış olabilir" diye tanınır.
      await this.prisma.netsisSyncRecord.update({
        where: { id: record.id },
        data: {
          payload: posting.body as unknown as Prisma.InputJsonValue,
          amount: posting.amount,
        },
      });

      phase = "send";
      const created =
        posting.operation === "collection"
          ? await this.netsis.receipts.createCollection(posting.body)
          : await this.netsis.receipts.createBankTransfer(posting.body);
      const ref =
        readNetsisRecordRef(created) ??
        `${NETSIS_SYNC_LOCAL_REF_PREFIX}${record.idempotencyKey}`;

      await this.persistRef(record.id, ref);
      return this.markSynced(record.id, ref);
    } catch (error: unknown) {
      if (error instanceof NetsisSyncRefLostError) {
        return this.fail(
          record,
          "unknown",
          message("error.refLost", { ref: error.ref }),
        );
      }
      const outcome = netsisSyncFailureOutcome(error, phase);
      return this.fail(
        record,
        outcome,
        outcome === "unknown"
          ? `${this.outcomeUnknownText(record)} (${describeNetsisError(error)})`
          : describeNetsisError(error),
      );
    }
  }

  /**
   * Bütçesi tükenen (ya da sonucu bilinmeyen) kayıtları greplenebilir ALARM
   * olarak raporlar: admin'e kayıt başına 24 saatte bir in-app bildirim +
   * error log. Otomatik kurtarılmaz.
   */
  async reportExhausted(): Promise<number> {
    const exhausted = await this.prisma.netsisSyncRecord.findMany({
      where: {
        status: NetsisSyncStatus.failed,
        attemptCount: { gte: NETSIS_SYNC_MAX_ATTEMPTS },
      },
      orderBy: { updatedAt: "asc" },
      take: 100,
      select: {
        id: true,
        kind: true,
        sourceId: true,
        idempotencyKey: true,
        lastError: true,
      },
    });
    if (exhausted.length === 0) return 0;

    const adminLink = `${adminUrl()}/system/invoicing-settings`;
    for (const row of exhausted) {
      const line = `NETSIS_SYNC_EXHAUSTED id=${row.id} key=${row.idempotencyKey}: ${row.lastError ?? "-"}`;
      // Bildirim servisi yoksa tekilleştirme de yoktur: alarm her turda görünsün.
      const isNew = this.notifications
        ? await this.notifications
            .notifyAllAdminsOnce(
              `netsis-sync-exhausted:${row.id}`,
              24 * 60 * 60,
              NotificationType.NETSIS_SYNC_EXHAUSTED,
              {
                recordId: row.id,
                kindLabel: message(`kind.${row.kind}`),
                sourceId: row.sourceId,
                reason: (row.lastError ?? "-").slice(0, 200),
                adminLink,
              },
            )
            .catch((error: unknown) => {
              this.logger.warn(
                `tükenen Netsis kaydı admin bildirimi başarısız (${row.id}): ${(error as Error)?.message}`,
              );
              return true;
            })
        : true;
      if (isNew) this.logger.error(line);
      else this.logger.warn(`${line} (daha önce bildirildi)`);
    }
    return exhausted.length;
  }

  // ───────────────────────── iç adımlar ─────────────────────────

  /**
   * DB kirası: yalnız bir işçi aynı kaydı yazar. Durum + deneme sayısı (+ bayat
   * kirada son deneme anı) üzerinden CAS; sahiplenme bir deneme sayar ki çöken
   * işçi döngüsü de bütçeyle sınırlı kalsın.
   */
  private async claim(
    id: string,
  ): Promise<{ record: NetsisSyncRecord; sendMayHaveStarted: boolean } | null> {
    const current = await this.prisma.netsisSyncRecord.findUnique({
      where: { id },
    });
    if (!current) return null;
    if (
      current.status === NetsisSyncStatus.synced ||
      current.status === NetsisSyncStatus.skipped
    ) {
      return null;
    }
    if (
      current.status === NetsisSyncStatus.failed &&
      current.attemptCount >= NETSIS_SYNC_MAX_ATTEMPTS
    ) {
      return null;
    }
    const reclaim = current.status === NetsisSyncStatus.processing;
    const staleBefore = new Date(Date.now() - NETSIS_SYNC_LEASE_MS);
    if (
      reclaim &&
      current.lastAttemptAt &&
      current.lastAttemptAt >= staleBefore
    ) {
      return null;
    }

    const now = new Date();
    const claim = await this.prisma.netsisSyncRecord.updateMany({
      where: {
        id,
        status: current.status,
        attemptCount: current.attemptCount,
        ...(reclaim ? { lastAttemptAt: current.lastAttemptAt } : {}),
      },
      data: {
        status: NetsisSyncStatus.processing,
        attemptCount: { increment: 1 },
        lastAttemptAt: now,
        // Yeni deneme: gövde gönderimden hemen önce yeniden yazılacak.
        // Bayat kirada SİLİNMEZ — "gönderim başlamış olabilir" işaretidir.
        ...(reclaim ? {} : { payload: Prisma.DbNull }),
      },
    });
    if (claim.count !== 1) return null;
    return {
      record: {
        ...current,
        status: NetsisSyncStatus.processing,
        attemptCount: current.attemptCount + 1,
        lastAttemptAt: now,
      },
      sendMayHaveStarted:
        reclaim && current.payload !== null && current.netsisRef === null,
    };
  }

  /** Fatura tahsilatının carisi: faturanın Netsis fişindeki cari (tek gerçek). */
  private async resolveSource(
    source: LoadedNetsisAccountingSource,
  ): Promise<NetsisAccountingSource> {
    if (source.kind !== "invoice_collection") return source;
    const { providerRef, ...rest }: LoadedInvoiceCollectionSource = source;
    const ref = parseNetsisProviderRef(providerRef);
    if (!ref) {
      throw new NetsisAccountingMappingError(
        "server.netsis.accounting.error.invalidProviderRef",
        { ref: providerRef },
      );
    }
    const slip = await this.netsis.itemSlips.details({
      FaturaTip: ref.docType,
      FATIRS_NO: ref.documentNumber,
    });
    // Fiş yoksa ERP tarafı henüz tutarlı değil olabilir: sıradan deneme.
    if (!slip) {
      throw new Error(message("error.slipNotFound", { number: ref.documentNumber }));
    }
    const cariCode = netsisSlipKey(slip)?.CARI_KODU?.trim();
    if (!cariCode) {
      throw new NetsisAccountingMappingError(
        "server.netsis.accounting.error.slipCariMissing",
        { number: ref.documentNumber },
      );
    }
    return { ...rest, cariCode };
  }

  /**
   * Netsis'te oluşan kaydın anahtarı — durumdan ÖNCE, ayrı yazım. Geçici DB
   * hatasında birkaç kez denenir; yine olmazsa çağıran satırı insana bırakır.
   */
  private async persistRef(id: string, ref: string): Promise<void> {
    for (let attempt = 1; attempt <= REF_WRITE_ATTEMPTS; attempt++) {
      try {
        await this.prisma.netsisSyncRecord.update({
          where: { id },
          data: { netsisRef: ref },
        });
        return;
      } catch (error: unknown) {
        this.logger.error(
          `NETSIS_SYNC_REF_WRITE_FAILED id=${id} ref=${ref} deneme=${attempt}: ${(error as Error)?.message}`,
        );
      }
    }
    throw new NetsisSyncRefLostError(ref);
  }

  private async markSynced(
    id: string,
    ref: string,
  ): Promise<NetsisSyncStatus> {
    await this.prisma.netsisSyncRecord.update({
      where: { id },
      data: {
        status: NetsisSyncStatus.synced,
        netsisRef: ref,
        syncedAt: new Date(),
        lastError: null,
      },
    });
    return NetsisSyncStatus.synced;
  }

  /** Kaynak artık aynalanacak bir hareket değil: bütçe tüketmeden kapanır. */
  private async skip(
    record: NetsisSyncRecord,
    reason: string,
  ): Promise<NetsisSyncStatus> {
    await this.prisma.netsisSyncRecord.update({
      where: { id: record.id },
      data: {
        status: NetsisSyncStatus.skipped,
        attemptCount: { decrement: 1 },
        lastError: reason,
      },
    });
    return NetsisSyncStatus.skipped;
  }

  private async fail(
    record: NetsisSyncRecord,
    outcome: NetsisSyncFailureOutcome,
    lastError: string,
  ): Promise<NetsisSyncStatus> {
    const status =
      outcome === "retry" ? NetsisSyncStatus.pending : NetsisSyncStatus.failed;
    const attemptCount =
      outcome === "retry"
        ? { decrement: 1 }
        : outcome === "attempt"
          ? undefined
          : Math.max(NETSIS_SYNC_MAX_ATTEMPTS, record.attemptCount);
    const text = lastError.slice(0, 1000);
    if (outcome === "unknown") {
      this.logger.error(
        `NETSIS_SYNC_OUTCOME_UNKNOWN id=${record.id} key=${record.idempotencyKey}: ${text}`,
      );
    } else {
      this.logger.warn(
        `Netsis muhasebe kaydı başarısız (${record.idempotencyKey}, ${outcome}): ${text}`,
      );
    }
    // Bu yazım da düşerse satır `processing` kalır; kirası dolunca sahiplenme
    // dolu `payload`'ı görüp satırı insana bırakır — sessiz çift kayıt olmaz.
    await this.prisma.netsisSyncRecord
      .update({
        where: { id: record.id },
        data: {
          status,
          lastError: text,
          ...(attemptCount === undefined ? {} : { attemptCount }),
        },
      })
      .catch((error: unknown) =>
        this.logger.error(
          `Netsis muhasebe kaydının durumu yazılamadı (${record.id}): ${(error as Error)?.message}`,
        ),
      );
    return status;
  }

  private outcomeUnknownText(record: NetsisSyncRecord): string {
    return translateMessage(
      "server.netsis.accounting.error.outcomeUnknown",
      "tr",
      { tracking: record.idempotencyKey },
    );
  }
}
