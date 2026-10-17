import { Global, Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bull";
import { QUEUE_NAMES } from "../../workers/constants";
import { scheduledProcessors } from "../../workers/scheduled-processors";
import { MailModule } from "../mail/mail.module";
import { MailRoutingService } from "./mail-routing.service";
import { MailSenderAccountService } from "./mail-sender-account.service";
import { MailInternalNotifier } from "./internal/mail-internal-notifier.service";
import { MailInternalDeliveryService } from "./internal/mail-internal-delivery.service";
import { MailDigestScheduler } from "./jobs/mail-digest.scheduler";
import { MailDigestScheduledProcessor } from "./jobs/mail-digest-scheduled.processor";

/**
 * Mail Yönlendirme (docs/MAIL_ROUTING.md): gönderici kutuları ve alan
 * ayarlarının yazma yüzeyi (admin modülü kullanır) + personel bildirimleri.
 *
 * @Global: `MailInternalNotifier` sipariş, ödeme, iade, takas, teklif, destek,
 * şikayet, ilan, indirim ve öne çıkarma akışlarının hepsinden çağrılır — outbox
 * gibi kesişen bir altyapıdır; her alan modülüne ayrı import, unutulan birinde
 * bildirimi sessizce kapatırdı. Bağımlılıkları yalnız Mail + global
 * Prisma/Outbox olduğundan döngü riski yoktur.
 */
@Global()
@Module({
  imports: [
    MailModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.SCHEDULED }),
  ],
  providers: [
    MailRoutingService,
    MailSenderAccountService,
    MailInternalNotifier,
    MailInternalDeliveryService,
    MailDigestScheduler,
    ...scheduledProcessors(MailDigestScheduledProcessor),
  ],
  exports: [MailRoutingService, MailSenderAccountService, MailInternalNotifier],
})
export class MailRoutingModule {}
