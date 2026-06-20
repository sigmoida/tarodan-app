import { Module, forwardRef } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';
import { OrderSchedulerService } from './order-scheduler.service';
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
    forwardRef(() => NotificationModule),
    DiscountModule,
    StorageModule,
    SuratCargoModule,
    ProductModule,
    CommissionModule,
    TaxModule,
  ],
  controllers: [OrderController],
  providers: [OrderService, OrderSchedulerService],
  exports: [OrderService],
})
export class OrderModule {}
