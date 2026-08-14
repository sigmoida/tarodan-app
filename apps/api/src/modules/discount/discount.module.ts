import { Module } from "@nestjs/common";
import { DiscountController } from "./discount.controller";
import { DiscountService } from "./discount.service";
import { DiscountUsageService } from "./discount-usage.service";
import { FeeDiscountResolver } from "./engine/fee-discount.resolver";
import { PrismaModule } from "../../prisma";
import { SearchModule } from "../search/search.module";

@Module({
  imports: [PrismaModule, SearchModule],
  controllers: [DiscountController],
  providers: [DiscountService, DiscountUsageService, FeeDiscountResolver],
  exports: [DiscountService, FeeDiscountResolver],
})
export class DiscountModule {}
