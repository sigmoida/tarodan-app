import { Module } from '@nestjs/common';
import { MarketingSchedulerService } from './marketing-scheduler.service';
import { NewsletterService } from './newsletter.service';
import { NewsletterController } from './newsletter.controller';
import { PrismaModule } from '../../prisma';
import { NotificationModule } from '../notification/notification.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [PrismaModule, NotificationModule, StorageModule],
  controllers: [NewsletterController],
  providers: [MarketingSchedulerService, NewsletterService],
  exports: [MarketingSchedulerService, NewsletterService],
})
export class MarketingModule {}
