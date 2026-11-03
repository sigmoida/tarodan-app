import { Module } from "@nestjs/common";
import { PrismaModule } from "../../../prisma";
import { UserModule } from "../../user/user.module";
import { SellerTrustModule } from "../seller-trust.module";
import { SellerTrustInputsModule } from "../inputs/seller-trust-inputs.module";
import { SellerTrustLabService } from "./seller-trust-lab.service";

/**
 * The read-only admin seller trust lab (tarodan-ops plan
 * 2026-11-03-seller-trust-score-lab). Imported only by `AdminModule`, never
 * by a domain module: through the inputs module it depends on the order,
 * refund, rating, trade and user modules. Not re-exported from the
 * seller-trust barrel, like the inputs module.
 */
@Module({
  imports: [
    PrismaModule,
    SellerTrustModule,
    SellerTrustInputsModule,
    UserModule,
  ],
  providers: [SellerTrustLabService],
  exports: [SellerTrustLabService],
})
export class SellerTrustLabModule {}
