import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma";
import { CommissionLedgerService } from "./commission-ledger.service";
import { CommissionRuleGuardService } from "./commission-rule-guard.service";

@Module({
  imports: [PrismaModule],
  providers: [CommissionLedgerService, CommissionRuleGuardService],
  exports: [CommissionLedgerService, CommissionRuleGuardService],
})
export class CommissionModule {}
