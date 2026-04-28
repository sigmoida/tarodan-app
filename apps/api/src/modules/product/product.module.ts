import { Module, forwardRef } from '@nestjs/common';
import { ProductService } from './product.service';
import { ProductController } from './product.controller';
import { ProductSchedulerService } from './product-scheduler.service';
import { ProductLockService } from './product-lock.service';
import { MembershipModule } from '../membership/membership.module';
import { SearchModule } from '../search/search.module';
import { WishlistModule } from '../wishlist/wishlist.module';
import { NotificationModule } from '../notification/notification.module';
import { DiscountModule } from '../discount/discount.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [
    forwardRef(() => MembershipModule),
    SearchModule,
    WishlistModule,
    forwardRef(() => NotificationModule),
    DiscountModule,
    StorageModule,
  ],
  controllers: [ProductController],
  providers: [ProductService, ProductSchedulerService, ProductLockService],
  exports: [ProductService, ProductSchedulerService, ProductLockService],
})
export class ProductModule {}
