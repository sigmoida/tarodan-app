import { Module } from "@nestjs/common";
import { DiscountController } from "./discount.controller";
import { DiscountService } from "./discount.service";
import { PrismaModule } from "../../prisma";
import { SearchModule } from "../search/search.module";

@Module({
  imports: [PrismaModule, SearchModule],
  controllers: [DiscountController],
  providers: [DiscountService],
  exports: [DiscountService],
})
export class DiscountModule {}
