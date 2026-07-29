import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

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
}
