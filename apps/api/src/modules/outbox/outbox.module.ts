import { Global, Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bull";
import { QUEUE_NAMES } from "../../workers/constants";
import { OutboxService } from "./outbox.service";
import { OutboxHandlerRegistry } from "./outbox-handler.registry";
import { OutboxDrainerService } from "./outbox-drainer.service";
import { OutboxScheduledProcessor } from "./outbox-scheduled.processor";
import { scheduledProcessors } from "../../workers/scheduled-processors";

/**
 * OutboxModule (Faz 5) — güvenilir yan-etki altyapısı. @Global: OutboxService +
 * OutboxHandlerRegistry her yerde enjekte edilebilsin (Prisma gibi altyapı).
 * PrismaModule global olduğundan burada ayrıca import edilmez. Faz 7: 'scheduled'
 * kuyruğu + OutboxScheduledProcessor ile Bull üzerinden de drain edilebilir.
 */
@Global()
@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_NAMES.SCHEDULED })],
  providers: [
    OutboxService,
    OutboxHandlerRegistry,
    OutboxDrainerService,
    ...scheduledProcessors(OutboxScheduledProcessor),
  ],
  exports: [OutboxService, OutboxHandlerRegistry],
})
export class OutboxModule {}
