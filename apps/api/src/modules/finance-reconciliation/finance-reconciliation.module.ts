import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma";
import { TaxModule } from "../tax";
import { OrderTaxPolicyService } from "../order/pricing/order-tax-policy.service";
import { RevenueSplitService } from "./revenue-split.service";
import { FinanceReconciliationService } from "./finance-reconciliation.service";

/**
 * Finans mutabakatı — Finans Özeti'nin sağlamalı bölümleri. S1 (ciro bölünmesi)
 * hem admin hem gece defter denetimi tarafından kullanılır; bu yüzden admin
 * modülünün içinde değil, ayrı ve bağımsız (yalnız Prisma + vergi) bir modül.
 */
@Module({
  imports: [PrismaModule, TaxModule],
  providers: [
    OrderTaxPolicyService,
    RevenueSplitService,
    FinanceReconciliationService,
  ],
  exports: [RevenueSplitService, FinanceReconciliationService],
})
export class FinanceReconciliationModule {}
