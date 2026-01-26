import { Module, forwardRef } from '@nestjs/common';
import { ProductService } from './product.service';
import { ProductController } from './product.controller';
import { ProductSchedulerService } from './product-scheduler.service';
import { MembershipModule } from '../membership/membership.module';
import { SearchModule } from '../search/search.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [forwardRef(() => MembershipModule), SearchModule, forwardRef(() => NotificationModule)],
  controllers: [ProductController],
  providers: [ProductService, ProductSchedulerService],
  exports: [ProductService, ProductSchedulerService],
})
export class ProductModule {}
