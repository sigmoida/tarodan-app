import { Module } from "@nestjs/common";
import { UserBlockModule } from "../user-block/user-block.module";
import { CartController } from "./cart.controller";
import { CartService } from "./cart.service";
import { PrismaModule } from "../../prisma";
import { DiscountModule } from "../discount";
import { StorageModule } from "../storage/storage.module";
import { ShippingTariffModule } from "../shipping/tariff/shipping-tariff.module";

@Module({
  imports: [
    PrismaModule,
    DiscountModule,
    StorageModule,
    ShippingTariffModule,
    UserBlockModule,
  ],
  controllers: [CartController],
  providers: [CartService],
  exports: [CartService],
})
export class CartModule {}
