import { Module, forwardRef } from '@nestjs/common';
import { ProductService } from './product.service';
import { ProductController } from './product.controller';
import { ProductSchedulerService } from './product-scheduler.service';
import { MembershipModule } from '../membership/membership.module';

@Module({
  imports: [forwardRef(() => MembershipModule)],
  controllers: [ProductController],
  providers: [ProductService, ProductSchedulerService],
  exports: [ProductService, ProductSchedulerService],
})
export class ProductModule {}
