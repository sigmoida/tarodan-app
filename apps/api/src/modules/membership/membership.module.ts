import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { MembershipController } from './membership.controller';
import { MembershipService } from './membership.service';
import { MembershipSchedulerService } from './membership-scheduler.service';
import { PrismaModule } from '../../prisma';
import { PaymentModule } from '../payment';

@Module({
  imports: [
    PrismaModule, 
    PaymentModule,
    BullModule.registerQueue({ name: 'email' }),
  ],
  controllers: [MembershipController],
  providers: [MembershipService, MembershipSchedulerService],
  exports: [MembershipService],
})
export class MembershipModule {}
