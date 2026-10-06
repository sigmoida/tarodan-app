import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { MailInternalEventId } from "@tarodan/types";
import { PrismaService } from "../../../prisma";
import { OutboxService } from "../../outbox/outbox.service";
import { OUTBOX_MAIL_INTERNAL_EVENT } from "../../outbox/outbox.types";
import { MailRoutingDirectory } from "../../mail/mail-routing-directory";
import { areaOfMailEvent } from "../../mail/helpers/mail-area-settings";
import type {
  MailInternalNoticePayload,
  MailInternalOutboxPayload,
} from "../helpers/mail-internal-notice.types";
import { internalNoticeRoute } from "./mail-internal-recipients";

export interface MailInternalEmitOptions {
  /** Test şeridi (isTest) işlemleri personele bildirilmez. */
  isTest?: boolean;
  /**
   * Aynı iş olayının ikinci kez bildirilmemesi için anahtar; verilmezse iş
   * numarası (`notice.ref`). Olay birden çok yerden yayılabiliyorsa (ör.
   * iptal) hepsi aynı anahtarı kullanır → tek e-posta.
   */
  dedupeKey?: string;
  /**
   * Verilirse outbox satırı İŞ İŞLEMİNİN İÇİNDE yazılır: işlem geri alınırsa
   * bildirim de yoktur. Bu modda satır yazımı işlemin bir parçasıdır (hata
   * işlemle birlikte yükselir); SMTP yine işlemin dışında, commit sonrası.
   */
  tx?: Prisma.TransactionClient;
}

/** Outbox satırının deneme sınırı (personel postası; ölü satır panelde görünür). */
const MAIL_INTERNAL_MAX_ATTEMPTS = 5;

/**
 * Personel bildirimlerinin TEK girişi: `emit(eventId, notice)`. Olay yerinde
 * yalnız bir outbox satırı yazar; e-posta (anlık ya da özet) outbox handler'ı
 * (`MailInternalDeliveryService`) tarafından commit sonrası gönderilir — iş
 * işlemi SMTP'yi hiç beklemez, e-posta hatası işlemi hiç bozmaz.
 *
 * Ön eleme: olay kapalıysa ya da alanın alıcısı yoksa satır hiç yazılmaz
 * (önbellekli ayardan; handler gönderim anında yeniden denetler).
 */
@Injectable()
export class MailInternalNotifier {
  private readonly logger = new Logger(MailInternalNotifier.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly routing: MailRoutingDirectory,
  ) {}

  /**
   * `tx` yoksa ASLA fırlatmaz (çağıran `await` etse de etmese de iş akışı
   * etkilenmez). `tx` varsa yalnız satır yazımının kendi hatası yükselir.
   */
  async emit(
    eventId: MailInternalEventId,
    notice: MailInternalNoticePayload,
    options: MailInternalEmitOptions = {},
  ): Promise<void> {
    if (options.isTest) return;
    if (!(await this.wanted(eventId))) return;

    const payload: MailInternalOutboxPayload = {
      eventId,
      notice,
      occurredAt: new Date().toISOString(),
    };
    const write = (db: Prisma.TransactionClient) =>
      this.outbox.enqueue(db, {
        type: OUTBOX_MAIL_INTERNAL_EVENT,
        payload: payload as unknown as Prisma.InputJsonValue,
        dedupeKey: `${OUTBOX_MAIL_INTERNAL_EVENT}:${eventId}:${options.dedupeKey ?? notice.ref}`,
        maxAttempts: MAIL_INTERNAL_MAX_ATTEMPTS,
      });

    if (options.tx) {
      await write(options.tx);
      return;
    }
    try {
      await write(this.prisma);
    } catch (error: unknown) {
      this.logger.error(
        `Personel bildirimi kuyruğa yazılamadı (${eventId} ${notice.ref}): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** Ayar okunamazsa satır yazılır: karar handler'da yeniden verilir. */
  private async wanted(eventId: MailInternalEventId): Promise<boolean> {
    try {
      const routing = await this.routing.area(areaOfMailEvent(eventId));
      return internalNoticeRoute(eventId, routing) !== null;
    } catch {
      return true;
    }
  }
}
