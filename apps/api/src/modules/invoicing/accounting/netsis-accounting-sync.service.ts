import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from "@nestjs/common";
import {
  NetsisSyncStatus,
  Prisma,
  type NetsisSyncKind,
  type NetsisSyncRecord,
} from "@prisma/client";
import { PrismaService } from "../../../prisma";
import { i18nMessage } from "../../i18n/localized-message";
import { translateMessage } from "../../i18n/translate";
import { OutboxHandlerRegistry } from "../../outbox/outbox-handler.registry";
import {
  OUTBOX_NETSIS_ACCOUNTING_SYNC,
  type NetsisAccountingSyncPayload,
} from "../../outbox/outbox.types";
import {
  NETSIS_SYNC_SOURCE_TYPE,
  netsisSyncIdempotencyKey,
} from "./netsis-accounting-mapper";
import {
  loadNetsisAccountingSettings,
  netsisAccountingActive,
} from "./netsis-accounting-settings";
import { NetsisAccountingSourceService } from "./netsis-accounting-source.service";
import { NETSIS_SYNC_LEASE_MS } from "./netsis-sync-failure-policy";

/** Olay kaybolursa (süreç tam commit sonrası öldü) süpürmenin geriye bakışı. */
export const NETSIS_SYNC_SWEEP_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
/** Tür başına bir turda en çok bu kadar kaynak (sıralı, sınırlı aday sorgusu). */
export const NETSIS_SYNC_SWEEP_BATCH = 200;

const KINDS: readonly NetsisSyncKind[] = [
  "invoice_collection",
  "settlement_transfer",
  "payout_transfer",
  "refund_reversal",
];

/** Denetim kaydının önce/sonra görüntüsü (yalnız durumu anlatan alanlar). */
export type NetsisSyncAuditSnapshot = Pick<
  NetsisSyncRecord,
  "status" | "attemptCount" | "lastError" | "netsisRef"
>;

export type NetsisSyncAfterWrite = (
  tx: Prisma.TransactionClient,
  before: NetsisSyncAuditSnapshot,
  after: NetsisSyncAuditSnapshot,
) => Promise<void>;

const snapshot = (record: NetsisSyncRecord): NetsisSyncAuditSnapshot => ({
  status: record.status,
  attemptCount: record.attemptCount,
  lastError: record.lastError,
  netsisRef: record.netsisRef,
});

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

/**
 * Muhasebe senkronunun KUYRUK tarafı: para hareketinden iş kaydı
 * (`NetsisSyncRecord`) açar. Netsis'e HİÇ gitmez — yazımı
 * `NetsisAccountingPostingService` cron'dan yapar. Bu yüzden bir isteğin ya da
 * para transaction'ının süresine, başarısına hiçbir etkisi yoktur.
 *
 * Kayıt üç yoldan açılır, üçü de idempotenttir (kaynak başına tek satır):
 *  1. outbox olayı (`OUTBOX_NETSIS_ACCOUNTING_SYNC`) — para akışları yayar,
 *  2. cron süpürmesi — kaybolan olayların ve olay yayılmayan kaynağın
 *     (Netsis faturası `sent` olduğunda) tek yolu,
 *  3. admin yeniden deneme / bakım script'i (mevcut satırı yeniden kuyruğa alır).
 */
@Injectable()
export class NetsisAccountingSyncService implements OnModuleInit {
  private readonly logger = new Logger(NetsisAccountingSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sources: NetsisAccountingSourceService,
    private readonly outboxHandlers: OutboxHandlerRegistry,
  ) {}

  onModuleInit(): void {
    // At-least-once teslim: `enqueue` kaynak başına tek satır açar, ikinci
    // teslim mevcut satırı döndürür. Hata fırlarsa outbox yeniden dener.
    this.outboxHandlers.register(
      OUTBOX_NETSIS_ACCOUNTING_SYNC,
      async (payload: NetsisAccountingSyncPayload) => {
        if (!payload?.kind || !payload?.sourceId) {
          throw new Error("Netsis accounting sync payload is incomplete");
        }
        await this.enqueue(payload.kind, payload.sourceId);
      },
    );
  }

  /**
   * Kaynağın iş kaydını açar (varsa olanı döndürür). Kaynak henüz kesin değil
   * ya da bize ait değilse satır açılmaz (`null`). Senkron kapalıysa ya da
   * kaynak aynalanacak bir hareket değilse satır `skipped` açılır.
   */
  async enqueue(
    kind: NetsisSyncKind,
    sourceId: string,
  ): Promise<NetsisSyncRecord | null> {
    const idempotencyKey = netsisSyncIdempotencyKey(kind, sourceId);
    const existing = await this.prisma.netsisSyncRecord.findUnique({
      where: { idempotencyKey },
    });
    if (existing) return existing;

    const load = await this.sources.load(kind, sourceId);
    if (load.state === "absent") return null;

    const settings = await loadNetsisAccountingSettings(this.prisma);
    const skipReason =
      load.state === "not_applicable"
        ? load.reason
        : netsisAccountingActive(settings)
          ? null
          : translateMessage("server.netsis.accounting.skip.disabled", "tr");

    try {
      return await this.prisma.netsisSyncRecord.create({
        data: {
          kind,
          sourceType: NETSIS_SYNC_SOURCE_TYPE[kind],
          sourceId,
          idempotencyKey,
          status: skipReason ? NetsisSyncStatus.skipped : NetsisSyncStatus.pending,
          lastError: skipReason,
        },
      });
    } catch (error: unknown) {
      // Yarış: aynı olayı başka bir teslim/süpürme az önce açtı.
      if (!isUniqueViolation(error)) throw error;
      return this.prisma.netsisSyncRecord.findUnique({
        where: { idempotencyKey },
      });
    }
  }

  /**
   * Geriye dönük süpürme (backstop): son 30 günde kesinleşmiş ama satırı
   * olmayan kaynakları bulur ve kuyruğa alır. Aday sorgusu kaba (durum +
   * pencere + "satırı yok"), kararı `enqueue` → kaynak okuyucusu verir.
   * Her tür sıralı ve sınırlıdır; bir türün hatası diğerlerini durdurmaz.
   */
  async sweep(now: Date = new Date()): Promise<number> {
    const since = new Date(now.getTime() - NETSIS_SYNC_SWEEP_WINDOW_MS);
    let opened = 0;
    for (const kind of KINDS) {
      const ids = await this.candidates(kind, since).catch((error: unknown) => {
        this.logger.warn(
          `Netsis muhasebe süpürmesi (${kind}) aday sorgusu başarısız: ${(error as Error)?.message}`,
        );
        return [] as string[];
      });
      for (const id of ids) {
        const record = await this.enqueue(kind, id).catch((error: unknown) => {
          this.logger.warn(
            `Netsis muhasebe kaydı açılamadı (${kind}:${id}): ${(error as Error)?.message}`,
          );
          return null;
        });
        if (record) opened++;
      }
    }
    return opened;
  }

  /**
   * Admin müdahalesi: deneme bütçesini sıfırlayıp kaydı yeniden kuyruğa alır —
   * ya da (`netsisRef` verilirse) kayıt Netsis'te zaten bulunduğu için
   * eşleştirip `synced` işaretler (sonucu bilinmeyen gönderimin elle
   * mutabakatı). Denetim kaydı `afterWrite` ile AYNI işlemde yazılır.
   */
  async resetForRetry(
    id: string,
    options: { netsisRef?: string; afterWrite?: NetsisSyncAfterWrite } = {},
  ): Promise<NetsisSyncRecord> {
    const manualRef = options.netsisRef?.trim() || null;
    return this.prisma.$transaction(async (tx) => {
      const record = await tx.netsisSyncRecord.findUnique({ where: { id } });
      if (!record) {
        throw new NotFoundException(
          i18nMessage("server.netsis.accounting.recordNotFound"),
        );
      }
      const leaseHeld =
        record.status === NetsisSyncStatus.processing &&
        record.lastAttemptAt !== null &&
        record.lastAttemptAt.getTime() > Date.now() - NETSIS_SYNC_LEASE_MS;
      if (record.status === NetsisSyncStatus.synced || leaseHeld) {
        throw new ConflictException(
          i18nMessage("server.netsis.accounting.notRetryable", {
            status: record.status,
          }),
        );
      }
      const updated = await tx.netsisSyncRecord.update({
        where: { id },
        data: manualRef
          ? {
              status: NetsisSyncStatus.synced,
              netsisRef: manualRef,
              syncedAt: new Date(),
              lastError: null,
            }
          : {
              status: NetsisSyncStatus.pending,
              attemptCount: 0,
              lastAttemptAt: null,
              lastError: null,
            },
      });
      await options.afterWrite?.(tx, snapshot(record), snapshot(updated));
      return updated;
    });
  }

  /**
   * Türün aday kaynakları. Ham SQL: kaynak ile satır arasında ilişki (FK)
   * bilerek yok, "satırı olmayan" sorusu NOT EXISTS ile sorulur. Sabitler
   * SQL'e literal yazılır (enum karşılaştırması), yalnız pencere ve sınır
   * parametredir.
   */
  private async candidates(
    kind: NetsisSyncKind,
    since: Date,
  ): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(
      this.candidateQuery(kind, since),
    );
    return rows.map((row) => row.id);
  }

  private candidateQuery(kind: NetsisSyncKind, since: Date): Prisma.Sql {
    const limit = NETSIS_SYNC_SWEEP_BATCH;
    switch (kind) {
      case "invoice_collection":
        return Prisma.sql`
          SELECT ei.id FROM elogo_invoices ei
          WHERE ei.provider = 'netsis'
            AND ei.status IN ('sent', 'signed')
            AND ei.type <> 'return_invoice'
            AND ei.sent_at >= ${since}
            AND NOT EXISTS (
              SELECT 1 FROM netsis_sync_records r
              WHERE r.kind = 'invoice_collection' AND r.source_id = ei.id
            )
          ORDER BY ei.sent_at ASC
          LIMIT ${limit}`;
      case "settlement_transfer":
        return Prisma.sql`
          SELECT s.id FROM paytr_settlements s
          WHERE s.is_projection = false
            AND s.items_synced_at IS NOT NULL
            AND s.date_paid >= ${since}
            AND NOT EXISTS (
              SELECT 1 FROM netsis_sync_records r
              WHERE r.kind = 'settlement_transfer' AND r.source_id = s.id
            )
          ORDER BY s.date_paid ASC
          LIMIT ${limit}`;
      case "payout_transfer":
        return Prisma.sql`
          SELECT p.id FROM payout_transfers p
          WHERE p.status = 'completed'
            AND p.processed_at >= ${since}
            AND NOT EXISTS (
              SELECT 1 FROM netsis_sync_records r
              WHERE r.kind = 'payout_transfer' AND r.source_id = p.id
            )
          ORDER BY p.processed_at ASC
          LIMIT ${limit}`;
      case "refund_reversal":
        return Prisma.sql`
          SELECT a.id FROM refund_attempts a
          WHERE a.status IN ('succeeded', 'finalized')
            AND a.updated_at >= ${since}
            AND NOT EXISTS (
              SELECT 1 FROM netsis_sync_records r
              WHERE r.kind = 'refund_reversal' AND r.source_id = a.id
            )
          ORDER BY a.updated_at ASC
          LIMIT ${limit}`;
    }
  }
}
