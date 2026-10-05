import { Injectable } from "@nestjs/common";
import { OutboxStatus, Prisma } from "@prisma/client";

export interface OutboxEnqueueInput {
  /** Handler dispatch anahtarı (OutboxHandlerRegistry ile eşleşmeli). */
  type: string;
  /** Handler girdisi. PAN/CVV/hassas PII YAZILMAZ — yalnız id'ler + tutar. */
  payload: Prisma.InputJsonValue;
  /** İdempotency: aynı mantıksal yan-etki iki kez enqueue edilmez (unique). */
  dedupeKey?: string;
  /** Varsayılan 8; kalıcı-başarısızda DLQ (dead). */
  maxAttempts?: number;
}

/**
 * OutboxService — para mutasyonuyla AYNI transaction'da güvenilir yan-etki satırı yazar.
 *
 * TASARIM: `enqueue` bir Prisma TRANSACTION CLIENT alır (para tx'inin `tx`'i) ve satırı
 * o tx'e katar → tx commit olursa yan-etki KESİN işlenir, rollback olursa satır da geri
 * alınır (atomik). Bu yüzden enqueue, dedupe HARİCİ hatalarda FIRLATIR (tx bozulmalı;
 * "post-commit best-effort .catch(log)" güvenilmezliğinin panzehiri budur).
 *
 * Not: PrismaService (PrismaClient) da `Prisma.TransactionClient`'a atanabilir, bu yüzden
 * çağıran bir tx yoksa `this.prisma`'yı da geçebilir (fire-and-forget) — ama asıl değer
 * para tx'iyle atomik yazımdır.
 */
@Injectable()
export class OutboxService {
  async enqueue(
    tx: Prisma.TransactionClient,
    input: OutboxEnqueueInput,
  ): Promise<void> {
    const data = {
      type: input.type,
      payload: input.payload,
      maxAttempts: input.maxAttempts ?? 8,
    };
    if (input.dedupeKey) {
      // upsert = tx-güvenli idempotency: dedupeKey varsa NO-OP (update {}), yoksa insert.
      // (Ham create + P2002 yakalama Postgres'te tx'i "aborted" bırakır — upsert bundan kaçınır.)
      await tx.outboxEvent.upsert({
        where: { dedupeKey: input.dedupeKey },
        create: { ...data, dedupeKey: input.dedupeKey },
        update: {},
      });
    } else {
      await tx.outboxEvent.create({ data });
    }
  }

  /**
   * Anlık yol + dayanıklı backstop: iş, kendi tx'inde `dedupeKey` ile kuyruğa
   * alınmış bir satırın SAHİBİ olarak burada hemen çalıştırılır.
   *
   * Sahiplik drainer'ın kullandığı CAS'ın aynısıdır (`pending → processing`):
   * satır pending değilse (drainer almış, iş bitmiş ya da başka bir istek
   * çalıştırıyor) iş ÇALIŞMAZ ve `{ ran: false }` döner — aynı iş iki yerden
   * eşzamanlı koşmaz. İş fırlatırsa satır pending'e geri bırakılır, drainer
   * yeniden dener; süreç iş ortasında ölürse drainer'ın bayat-processing
   * kurtarması (`reclaimStaleProcessing`) satırı geri alır. Bu yüzden iş,
   * handler'ı gibi idempotent olmalıdır.
   */
  async runInline<T>(
    db: Prisma.TransactionClient,
    dedupeKey: string,
    work: () => Promise<T>,
  ): Promise<{ ran: true; result: T } | { ran: false }> {
    const claim = await db.outboxEvent.updateMany({
      where: { dedupeKey, status: OutboxStatus.pending },
      data: { status: OutboxStatus.processing },
    });
    if (claim.count === 0) return { ran: false };

    let result: T;
    try {
      result = await work();
    } catch (error: unknown) {
      await db.outboxEvent
        .updateMany({
          where: { dedupeKey, status: OutboxStatus.processing },
          data: {
            status: OutboxStatus.pending,
            lastError: String(
              error instanceof Error ? error.message : error,
            ).slice(0, 1000),
          },
        })
        // Bırakma da başarısızsa satır processing'te kalır; bayat-processing
        // kurtarması onu pending'e döndürür.
        .catch(() => undefined);
      throw error;
    }
    await db.outboxEvent
      .updateMany({
        where: { dedupeKey, status: OutboxStatus.processing },
        data: {
          status: OutboxStatus.completed,
          processedAt: new Date(),
          lastError: null,
        },
      })
      // İş bitti; kapatma yazılamazsa drainer işi en fazla bir kez daha
      // (idempotent) çalıştırır. Başarılı işi hataya çevirmeyiz.
      .catch(() => undefined);
    return { ran: true, result };
  }
}
