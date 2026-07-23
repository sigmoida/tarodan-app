import { Global, Module } from "@nestjs/common";
import { OutboxService } from "./outbox.service";
import { OutboxHandlerRegistry } from "./outbox-handler.registry";
import { OutboxDrainerService } from "./outbox-drainer.service";

/**
 * OutboxModule (Faz 5) — güvenilir yan-etki altyapısı. @Global: OutboxService +
 * OutboxHandlerRegistry her yerde enjekte edilebilsin (Prisma gibi altyapı).
 * PrismaModule global olduğundan burada ayrıca import edilmez.
 */
@Global()
@Module({
  providers: [OutboxService, OutboxHandlerRegistry, OutboxDrainerService],
  exports: [OutboxService, OutboxHandlerRegistry],
})
export class OutboxModule {}
