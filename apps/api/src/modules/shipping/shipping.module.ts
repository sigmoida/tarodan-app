import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ShippingController } from './shipping.controller';
import { ShippingService } from './shipping.service';
import { ShippingSchedulerService } from './shipping-scheduler.service';
import { PrismaModule } from '../../prisma';
import { PaymentModule } from '../payment/payment.module';
import { SuratCargoModule } from '../surat-cargo/surat-cargo.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [PrismaModule, ConfigModule, ScheduleModule.forRoot(), PaymentModule, SuratCargoModule, NotificationModule],
  controllers: [ShippingController],
  providers: [ShippingService, ShippingSchedulerService],
  exports: [ShippingService],
})
export class ShippingModule {}
