import { Module, forwardRef } from '@nestjs/common';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';
import { PrismaModule } from '../../prisma';
import { EventModule } from '../events';
import { NotificationModule } from '../notification/notification.module';
import { DiscountModule } from '../discount';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [
    PrismaModule,
    EventModule,
    forwardRef(() => NotificationModule),
    DiscountModule,
    StorageModule,
  ],
  controllers: [OrderController],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}
