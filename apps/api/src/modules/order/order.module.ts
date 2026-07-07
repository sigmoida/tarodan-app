import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bull';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';
import { OrderPricingService } from './order-pricing.service';
import { OrderCheckoutService } from './order-checkout.service';
import { OrderCommonService } from './order-common.service';
import { OrderQueryService } from './order-query.service';
import { OrderLifecycleService } from './order-lifecycle.service';
import { OrderSchedulerService } from './order-scheduler.service';
import { OrderScheduledProcessor } from './order-scheduled.processor';
import { QUEUE_NAMES } from '../../workers/constants';
import { PrismaModule } from '../../prisma';
import { EventModule } from '../events';
import { NotificationModule } from '../notification/notification.module';
import { DiscountModule } from '../discount';
import { StorageModule } from '../storage/storage.module';
import { SuratCargoModule } from '../surat-cargo/surat-cargo.module';
import { ProductModule } from '../product/product.module';
import { CommissionModule } from '../commission/commission.module';
import { TaxModule } from '../tax/tax.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    EventModule,
    NotificationModule,
    DiscountModule,
    StorageModule,
    SuratCargoModule,
    ProductModule,
    CommissionModule,
    TaxModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.SCHEDULED }),
  ],
  controllers: [OrderController],
  providers: [OrderService, OrderPricingService, OrderCheckoutService, OrderCommonService, OrderQueryService, OrderLifecycleService, OrderSchedulerService, OrderScheduledProcessor],
  exports: [OrderService],
})
export class OrderModule {}
