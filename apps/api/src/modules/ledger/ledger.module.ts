import { Global, Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bull";
import { QUEUE_NAMES } from "../../workers/constants";
import { LedgerService } from "./ledger.service";
import { LedgerBalanceService } from "./ledger-balance.service";
import { LedgerReconciliationService } from "./ledger-reconciliation.service";
import { LedgerScheduledProcessor } from "./ledger-scheduled.processor";

/**
 * LedgerModule (Faz 6) — değişmez çift-taraflı defter + günlük drift reconciliation.
 * @Global: LedgerService para akışlarından (@Optional) enjekte edilebilsin. Faz 7:
 * 'scheduled' kuyruğu + LedgerScheduledProcessor ile reconciliation Bull üzerinden koşar.
 */
@Global()
@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_NAMES.SCHEDULED })],
  providers: [
    LedgerService,
    LedgerBalanceService,
    LedgerReconciliationService,
    LedgerScheduledProcessor,
  ],
  exports: [LedgerService, LedgerBalanceService, LedgerReconciliationService],
})
export class LedgerModule {}
