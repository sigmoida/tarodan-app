import { Injectable, Logger } from "@nestjs/common";
import type { OutboxEvent } from "@prisma/client";

/**
 * Bir outbox olayını işleyen handler. Payload, enqueue'da yazılan JSON'dur.
 * KRİTİK: handler İDEMPOTENT olmalı — drainer at-least-once çalışır (retry / çift
 * drainer / kısmen tamamlanmış iş). Aynı iş iki kez çalışınca yan-etki tekrarlanmamalı.
 */
export type OutboxHandler = (payload: any, event: OutboxEvent) => Promise<void>;

/**
 * type → handler kaydı. Domain servisleri (fatura, bildirim, iade…) handler'larını
 * onModuleInit'te register eder; OutboxDrainerService dispatch için buradan okur.
 * Böylece outbox modülü domain modüllerine bağımlı olmaz (döngü yok).
 */
@Injectable()
export class OutboxHandlerRegistry {
  private readonly logger = new Logger(OutboxHandlerRegistry.name);
  private readonly handlers = new Map<string, OutboxHandler>();

  register(type: string, handler: OutboxHandler): void {
    if (this.handlers.has(type)) {
      throw new Error(`Outbox handler zaten kayıtlı: ${type}`);
    }
    this.handlers.set(type, handler);
    this.logger.log(`Outbox handler kaydedildi: ${type}`);
  }

  get(type: string): OutboxHandler | undefined {
    return this.handlers.get(type);
  }

  /** Kayıtlı tipler (teşhis/test için). */
  types(): string[] {
    return [...this.handlers.keys()];
  }
}
