import { Module, forwardRef } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TradeController } from './trade.controller';
import { TradeService } from './trade.service';
import { TradeSchedulerService } from './trade-scheduler.service';
import { PrismaModule } from '../../prisma';
import { CacheModule } from '../cache/cache.module';
import { MembershipModule } from '../membership/membership.module';
import { NotificationModule } from '../notification/notification.module';
import { StorageModule } from '../storage/storage.module';
import { PaymentModule } from '../payment/payment.module';
import { ProductModule } from '../product/product.module';
import { EventModule } from '../events';

@Module({
  imports: [ScheduleModule.forRoot(), PrismaModule, CacheModule, MembershipModule, forwardRef(() => NotificationModule), StorageModule, PaymentModule, ProductModule, EventModule],
  controllers: [TradeController],
  providers: [TradeService, TradeSchedulerService],
  exports: [TradeService],
})
export class TradeModule {}
