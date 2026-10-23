import { Module } from "@nestjs/common";
import { UatProductionCopyService } from "./uat-production-copy.service";

/**
 * Leaf module (PrismaService only, global): the payment sweeps import it to
 * leave staging's production copies alone, without depending on the admin
 * test tools module and its imports.
 */
@Module({
  providers: [UatProductionCopyService],
  exports: [UatProductionCopyService],
})
export class UatProductionCopyModule {}
