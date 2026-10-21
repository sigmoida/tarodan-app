import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma";
import { SellerTrustService } from "./seller-trust.service";

/**
 * Seller trust score (ADR 0014): owner of `seller_trust_scores`. A leaf
 * (Prisma only), so user, product and admin can import it without a cycle.
 * The nightly batch lives in `jobs/SellerTrustJobsModule`, imported only by
 * AppModule.
 */
@Module({
  imports: [PrismaModule],
  providers: [SellerTrustService],
  exports: [SellerTrustService],
})
export class SellerTrustModule {}
