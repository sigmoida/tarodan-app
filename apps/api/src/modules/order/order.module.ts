import { Module, forwardRef } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bull';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';
import { OrderSchedulerService } from './order-scheduler.service';
import { OrderScheduledProcessor } from './order-scheduled.processor';
import { SellerInvoiceController } from './seller-invoice.controller';
import { SellerInvoiceService } from './seller-invoice.service';
import { SmtpProvider } from '../notification/providers/smtp.provider';
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
import { ElogoModule } from '../elogo';

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
    ElogoModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.SCHEDULED }),
  ],
  controllers: [OrderController, SellerInvoiceController],
  providers: [OrderService, OrderSchedulerService, OrderScheduledProcessor, SellerInvoiceService, SmtpProvider],
  exports: [OrderService],
})
export class OrderModule {}
