import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma";
import { ShippingTariffService } from "./shipping-tariff.service";

/**
 * Leaf module (Prisma-only) exposing ShippingTariffService — the single source of
 * shipping-tariff persistence + cached active-tariff read. Kept dependency-free so
 * both the order/checkout pricing path and the admin surface can import it without
 * creating module cycles.
 */
@Module({
  imports: [PrismaModule],
  providers: [ShippingTariffService],
  exports: [ShippingTariffService],
})
export class ShippingTariffModule {}
