import { Module } from "@nestjs/common";
import { DiscountController } from "./discount.controller";
import { DiscountService } from "./discount.service";
import { DiscountUsageService } from "./discount-usage.service";
import { DiscountCrudService } from "./discount-crud.service";
import { DiscountPricingService } from "./discount-pricing.service";
import { DiscountCouponService } from "./discount-coupon.service";
import { DiscountTradeFeeService } from "./discount-trade-fee.service";
import { FeeDiscountResolver } from "./engine/fee-discount.resolver";
import { PrismaModule } from "../../prisma";
import { SearchModule } from "../search/search.module";

@Module({
  imports: [PrismaModule, SearchModule],
  controllers: [DiscountController],
  providers: [
    DiscountService,
    DiscountUsageService,
    DiscountCrudService,
    DiscountPricingService,
    DiscountCouponService,
    DiscountTradeFeeService,
    FeeDiscountResolver,
  ],
  exports: [DiscountService, FeeDiscountResolver],
})
export class DiscountModule {}
