import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { QUEUE_NAMES } from '../../workers/constants';
import { ModerationModule } from '../moderation/moderation.module';
import { ProductService } from './product.service';
import { ProductBoostService } from './product-boost.service';
import { ProductController } from './product.controller';
import { ProductSchedulerService } from './product-scheduler.service';
import { ProductLockService } from './product-lock.service';
import { MembershipModule } from '../membership/membership.module';
import { SearchModule } from '../search/search.module';
import { WishlistModule } from '../wishlist/wishlist.module';
import { NotificationModule } from '../notification/notification.module';
import { DiscountModule } from '../discount/discount.module';
import { StorageModule } from '../storage/storage.module';
import { PaymentModule } from '../payment';

@Module({
  imports: [
    forwardRef(() => MembershipModule),
    SearchModule,
    WishlistModule,
    forwardRef(() => NotificationModule),
    DiscountModule,
    StorageModule,
    forwardRef(() => PaymentModule),
    BullModule.registerQueue({ name: QUEUE_NAMES.MODERATION }),
    ModerationModule,
  ],
  controllers: [ProductController],
  providers: [ProductService, ProductBoostService, ProductSchedulerService, ProductLockService],
  exports: [ProductService, ProductBoostService, ProductSchedulerService, ProductLockService],
})
export class ProductModule {}
