/**
 * DevModule — yalnız NODE_ENV=test'te AppModule'e koşullu eklenir (app.module.ts).
 * E2E test-hook'larını (cron tetikleme, backdate, db read) barındırır.
 */
import { Module } from "@nestjs/common";
import { DevController } from "./dev.controller";
import { PaymentModule } from "../payment";
import { ProductModule } from "../product/product.module";
import { TradeModule } from "../trade/trade.module";
import { MembershipModule } from "../membership/membership.module";
import { OfferModule } from "../offer/offer.module";
import { CacheModule } from "../cache/cache.module";
import { NotificationModule } from "../notification/notification.module";
import { BullModule } from "@nestjs/bull";
import { QUEUE_NAMES } from "../../workers/constants";

@Module({
  imports: [
    PaymentModule,
    ProductModule,
    TradeModule,
    MembershipModule,
    OfferModule,
    CacheModule,
    // Şablonlu tipler dispatch yolundan tohumlanır.
    NotificationModule,
    // EventService tipleri PushWorker yolundan üretilir → aynı kuyruk.
    BullModule.registerQueue({ name: QUEUE_NAMES.PUSH }),
  ],
  controllers: [DevController],
})
export class DevModule {}
