import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { MembershipController } from './membership.controller';
import { MembershipService } from './membership.service';
import { MembershipSchedulerService } from './membership-scheduler.service';
import { PrismaModule } from '../../prisma';
import { PaymentModule } from '../payment/payment.module';
import { PaymentProvidersModule } from '../payment-providers/payment-providers.module';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => PaymentModule),
    PaymentProvidersModule,
    BullModule.registerQueue({ name: 'email' }),
  ],
  controllers: [MembershipController],
  providers: [MembershipService, MembershipSchedulerService],
  exports: [MembershipService, MembershipSchedulerService],
})
export class MembershipModule {}
