import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bull';
import { PayoutService } from './payout.service';
import { PayoutSchedulerService } from './payout-scheduler.service';
import { PayoutScheduledProcessor } from './payout-scheduled.processor';
import { QUEUE_NAMES } from '../../workers/constants';
import { PrismaModule } from '../../prisma';
import { PaymentProvidersModule } from '../payment-providers';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    PrismaModule,
    PaymentProvidersModule,
    NotificationModule,
    ScheduleModule.forRoot(),
    BullModule.registerQueue({ name: QUEUE_NAMES.SCHEDULED }),
  ],
  providers: [PayoutService, PayoutSchedulerService, PayoutScheduledProcessor],
  exports: [PayoutService],
})
export class PayoutModule {}
