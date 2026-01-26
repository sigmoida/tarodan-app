import { Module } from '@nestjs/common';
import { MarketingSchedulerService } from './marketing-scheduler.service';
import { PrismaModule } from '../../prisma';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [PrismaModule, NotificationModule],
  providers: [MarketingSchedulerService],
  exports: [MarketingSchedulerService],
})
export class MarketingModule {}
