import { Module } from "@nestjs/common";
import { DiscountController } from "./discount.controller";
import { DiscountService } from "./discount.service";
import { FeeDiscountResolver } from "./fee-discount.resolver";
import { PrismaModule } from "../../prisma";
import { SearchModule } from "../search/search.module";

@Module({
  imports: [PrismaModule, SearchModule],
  controllers: [DiscountController],
  providers: [DiscountService, FeeDiscountResolver],
  exports: [DiscountService, FeeDiscountResolver],
})
export class DiscountModule {}
