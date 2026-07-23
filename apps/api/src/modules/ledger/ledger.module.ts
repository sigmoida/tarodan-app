import { Global, Module } from "@nestjs/common";
import { LedgerService } from "./ledger.service";
import { LedgerReconciliationService } from "./ledger-reconciliation.service";

/**
 * LedgerModule (Faz 6) — değişmez çift-taraflı defter + günlük drift reconciliation.
 * @Global: LedgerService para akışlarından (@Optional) enjekte edilebilsin.
 */
@Global()
@Module({
  providers: [LedgerService, LedgerReconciliationService],
  exports: [LedgerService, LedgerReconciliationService],
})
export class LedgerModule {}
