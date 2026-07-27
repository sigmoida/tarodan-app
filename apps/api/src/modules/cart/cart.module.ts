import { Module } from "@nestjs/common";
import { CartController } from "./cart.controller";
import { CartService } from "./cart.service";
import { PrismaModule } from "../../prisma";
import { DiscountModule } from "../discount";
import { StorageModule } from "../storage/storage.module";
import { ShippingTariffModule } from "../shipping/shipping-tariff.module";

@Module({
  imports: [PrismaModule, DiscountModule, StorageModule, ShippingTariffModule],
  controllers: [CartController],
  providers: [CartService],
  exports: [CartService],
})
export class CartModule {}
