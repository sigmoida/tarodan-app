import { Module } from "@nestjs/common";
import { DiscountController } from "./discount.controller";
import { DiscountService } from "./discount.service";
import { DiscountScopeService } from "./discount-scope.service";
import { ProductPriceResolver } from "./product-price-resolver.service";
import { PrismaModule } from "../../prisma";
import { SearchModule } from "../search/search.module";

@Module({
  imports: [PrismaModule, SearchModule],
  controllers: [DiscountController],
  providers: [DiscountService, DiscountScopeService, ProductPriceResolver],
  exports: [DiscountService, ProductPriceResolver],
})
export class DiscountModule {}
