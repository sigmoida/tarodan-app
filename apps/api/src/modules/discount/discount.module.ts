import { Module } from "@nestjs/common";
import { DiscountController } from "./discount.controller";
import { DiscountService } from "./discount.service";
import { DiscountCalculator } from "./discount-calculator";
import { FeeDiscountResolver } from "./fee-discount.resolver";
import { PrismaModule } from "../../prisma";
import { SearchModule } from "../search/search.module";

@Module({
  imports: [PrismaModule, SearchModule],
  controllers: [DiscountController],
  providers: [DiscountService, DiscountCalculator, FeeDiscountResolver],
  exports: [DiscountService, DiscountCalculator, FeeDiscountResolver],
})
export class DiscountModule {}
