import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectQueue } from "@nestjs/bull";
import { Queue } from "bull";
import { PrismaService } from "../../prisma";
import { OutboxStatus } from "@prisma/client";
import { registerRepeatableCron } from "../../monitoring/bull-cron.helper";
import { QUEUE_NAMES } from "../../workers/constants";
import { OutboxHandlerRegistry } from "./outbox-handler.registry";

/**
 * OutboxDrainerService — `pending & nextAttemptAt<=now` satırlarını CAS ile claim edip
 * kayıtlı handler'a verir. Başarı → completed; hata → attempts++ + exponential backoff;
 * maxAttempts aşılınca → dead (DLQ + alarm log). At-least-once: handler'lar idempotent.
 *
 * Faz 7.5: `runDrain()` yalnızca Bull processor'dan (OutboxScheduledProcessor
 * 'outbox-drain') çağrılır — tek-sefer garantisi + ayrı worker.
 */
@Injectable()
export class OutboxDrainerService implements OnModuleInit {
  private readonly logger = new Logger(OutboxDrainerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: OutboxHandlerRegistry,
    private readonly config: ConfigService,
    @InjectQueue(QUEUE_NAMES.SCHEDULED) private readonly scheduledQueue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    // Bull repeatable job (OutboxScheduledProcessor 'outbox-drain') her dakika
    // çalışır — tek zamanlama mekanizması, tek-sefer garantisi.
    await registerRepeatableCron(
      this.scheduledQueue,
      "outbox-drain",
      "*/1 * * * *",
      this.logger,
    );
  }

  private get batchLimit(): number {
    return parseInt(this.config.get("OUTBOX_DRAIN_BATCH_LIMIT") || "50", 10);
  }
  private get backoffBaseMs(): number {
    return parseInt(this.config.get("OUTBOX_BACKOFF_BASE_MS") || "10000", 10);
  }
  private get backoffCapMs(): number {
    return parseInt(
      this.config.get("OUTBOX_BACKOFF_CAP_MS") || `${60 * 60 * 1000}`,
      10,
    );
  }

  private get staleProcessingMs(): number {
    return parseInt(
      this.config.get("OUTBOX_STALE_PROCESSING_MS") || `${5 * 60 * 1000}`,
      10,
    );
  }

  /**
   * Bayat `processing` satırlarını `pending`'e geri alır.
   *
   * `pending → processing` claim'i DB tarafındadır; süreç işin ortasında çökerse
   * satır kalıcı olarak `processing`'te kalır. Bull'un stall kurtarması bu claim'i
   * GÖRMEZ, dolayısıyla para yan-etkisi (fulfillment yedeği, iade faturası ters
   * kaydı, kargo iptali) bir daha hiç denenmez; ayrıca readiness kontrolü bayat
   * satır yüzünden TÜM pod'larda /ready'yi düşürür (tek crash → sitewide 503).
   *
   * Handler'lar idempotent (at-least-once) olduğundan yeniden deneme güvenlidir.
   * `attempts` artırılır ki sürekli çöken bir satır sonunda DLQ'ya düşsün.
   */
  async reclaimStaleProcessing(): Promise<number> {
    const staleBefore = new Date(Date.now() - this.staleProcessingMs);
    const reclaimed = await this.prisma.outboxEvent.updateMany({
      where: {
        status: OutboxStatus.processing,
        updatedAt: { lt: staleBefore },
      },
      data: {
        status: OutboxStatus.pending,
        attempts: { increment: 1 },
        nextAttemptAt: new Date(),
      },
    });
    if (reclaimed.count > 0) {
      this.logger.warn(
        `OUTBOX_RECLAIMED count=${reclaimed.count} — kesintiye uğramış processing satırları yeniden kuyruğa alındı`,
      );
    }
    return reclaimed.count;
  }

  /** Gerçek iş — Bull processor buradan çağırır (bekleyen outbox olaylarını boşaltır). */
  async runDrain(log: (msg: string) => void = () => {}) {
    // Önce kesintiye uğramış claim'leri kurtar; aksi halde bu satırlar hiçbir
    // zaman `due` sorgusuna girmez ve yan-etkileri kalıcı olarak kaybolur.
    const reclaimed = await this.reclaimStaleProcessing();
    const now = new Date();
    const due = await this.prisma.outboxEvent.findMany({
      where: { status: OutboxStatus.pending, nextAttemptAt: { lte: now } },
      orderBy: { nextAttemptAt: "asc" },
      take: this.batchLimit,
    });

    let processed = 0;
    let retried = 0;
    let dead = 0;

    for (const row of due) {
      // CAS claim: yalnız hâlâ pending ise processing'e al (başka drainer/Bull yarışı).
      const claim = await this.prisma.outboxEvent.updateMany({
        where: { id: row.id, status: OutboxStatus.pending },
        data: { status: OutboxStatus.processing },
      });
      if (claim.count === 0) continue;

      try {
        const handler = this.registry.get(row.type);
        if (!handler) {
          throw new Error(`kayıtlı handler yok: ${row.type}`);
        }
        await handler(row.payload, row);
        await this.prisma.outboxEvent.update({
          where: { id: row.id },
          data: {
            status: OutboxStatus.completed,
            processedAt: new Date(),
            lastError: null,
          },
        });
        processed++;
      } catch (error: any) {
        const attempts = row.attempts + 1;
        const msg = String(error?.message ?? error).slice(0, 1000);
        if (attempts >= row.maxAttempts) {
          await this.prisma.outboxEvent.update({
            where: { id: row.id },
            data: {
              status: OutboxStatus.dead,
              attempts,
              lastError: msg,
            },
          });
          dead++;
          // DLQ: greplenebilir alarm — manuel inceleme gerekir (para yan-etkisi kalıcı başarısız).
          this.logger.error(
            `OUTBOX_DEAD type=${row.type} id=${row.id} attempts=${attempts}: ${msg}`,
          );
        } else {
          const backoffMs = Math.min(
            this.backoffBaseMs * 2 ** (attempts - 1),
            this.backoffCapMs,
          );
          await this.prisma.outboxEvent.update({
            where: { id: row.id },
            data: {
              status: OutboxStatus.pending,
              attempts,
              nextAttemptAt: new Date(Date.now() + backoffMs),
              lastError: msg,
            },
          });
          retried++;
        }
      }
    }

    if (processed > 0 || retried > 0 || dead > 0 || reclaimed > 0) {
      this.logger.log(
        `Outbox drain: ${processed} işlendi, ${retried} retry, ${dead} DLQ, ${reclaimed} reclaim`,
      );
    }
    const summary = `${processed} işlendi · ${retried} retry · ${dead} DLQ · ${reclaimed} reclaim`;
    log(`Outbox: ${summary}`);
    return {
      summary,
      stats: { processed, retried, dead, reclaimed },
    };
  }
}
