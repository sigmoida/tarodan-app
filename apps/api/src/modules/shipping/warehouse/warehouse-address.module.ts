import { Module } from "@nestjs/common";
import { PrismaModule } from "../../../prisma";
import { WarehouseAddressService } from "./warehouse-address.service";

/**
 * Deliberately tiny: the warehouse address is needed by trade, refund and admin
 * paths, and `ShippingModule` pulls in payment, carrier and notification
 * dependencies that those callers must not inherit just to read one address.
 * Same shape as `ShippingTariffModule` — a focused slice with its own module.
 */
@Module({
  imports: [PrismaModule],
  providers: [WarehouseAddressService],
  exports: [WarehouseAddressService],
})
export class WarehouseAddressModule {}
