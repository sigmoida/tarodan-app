import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { QUEUE_NAMES } from '../../workers/constants';
import { ModerationModule } from '../moderation/moderation.module';
import { ProductService } from './product.service';
import { ProductBoostService } from './product-boost.service';
import { ProductController } from './product.controller';
import { ProductSchedulerService } from './product-scheduler.service';
import { BoostScheduledProcessor } from './boost-scheduled.processor';
import { ProductLockModule } from './product-lock.module';
import { MembershipModule } from '../membership/membership.module';
import { SearchModule } from '../search/search.module';
import { WishlistModule } from '../wishlist/wishlist.module';
import { NotificationModule } from '../notification/notification.module';
import { DiscountModule } from '../discount/discount.module';
import { StorageModule } from '../storage/storage.module';
import { PaymentModule } from '../payment';

@Module({
  imports: [
    MembershipModule,
    SearchModule,
    WishlistModule,
    NotificationModule,
    DiscountModule,
    StorageModule,
    PaymentModule,
    ProductLockModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.MODERATION }),
    // Pilot: cron-tipi işler için 'scheduled' kuyruğu (Bull Board otomatik gösterir).
    BullModule.registerQueue({ name: QUEUE_NAMES.SCHEDULED }),
    ModerationModule,
  ],
  controllers: [ProductController],
  providers: [ProductService, ProductBoostService, ProductSchedulerService, BoostScheduledProcessor],
  // ProductLockModule'ü re-export et: ProductModule'ü import eden order/offer/trade
  // hâlâ ProductLockService'i alsın (davranış korunur).
  exports: [ProductService, ProductBoostService, ProductSchedulerService, ProductLockModule],
})
export class ProductModule {}
