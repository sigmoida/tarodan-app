import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PayoutService } from './payout.service';
import { PayoutSchedulerService } from './payout-scheduler.service';
import { PrismaModule } from '../../prisma';
import { PaymentProvidersModule } from '../payment-providers';

@Module({
  imports: [
    PrismaModule,
    PaymentProvidersModule,
    ScheduleModule.forRoot(),
  ],
  providers: [PayoutService, PayoutSchedulerService],
  exports: [PayoutService],
})
export class PayoutModule {}
