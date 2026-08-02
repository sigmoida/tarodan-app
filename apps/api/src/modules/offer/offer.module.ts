import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { BullModule } from "@nestjs/bull";
import { OfferController } from "./offer.controller";
import { OfferService } from "./offer.service";
import { OfferSchedulerService } from "./offer-scheduler.service";
import { OfferScheduledProcessor } from "./offer-scheduled.processor";
import { QUEUE_NAMES } from "../../workers/constants";
import { PrismaModule } from "../../prisma";
import { CacheModule } from "../cache/cache.module";
import { EventModule } from "../events";
import { NotificationModule } from "../notification/notification.module";
import { StorageModule } from "../storage/storage.module";
import { OrderModule } from "../order/order.module";
import { ProductModule } from "../product/product.module";
import { scheduledProcessors } from "../../workers/scheduled-processors";

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    CacheModule,
    EventModule,
    NotificationModule,
    StorageModule,
    OrderModule,
    ProductModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.SCHEDULED }),
  ],
  controllers: [OfferController],
  providers: [
    OfferService,
    OfferSchedulerService,
    ...scheduledProcessors(OfferScheduledProcessor),
  ],
  exports: [OfferService, OfferSchedulerService],
})
export class OfferModule {}
