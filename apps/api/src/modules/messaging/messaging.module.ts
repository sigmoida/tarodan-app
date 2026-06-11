import { Module, forwardRef } from '@nestjs/common';
import { MessagingController } from './messaging.controller';
import { MessagingService } from './messaging.service';
import { ContentFilterService } from './content-filter.service';
import { PrismaModule } from '../../prisma';
import { NotificationModule } from '../notification/notification.module';
import { StorageModule } from '../storage/storage.module';
import { ModerationModule } from '../moderation/moderation.module';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => NotificationModule),
    StorageModule,
    ModerationModule,
  ],
  controllers: [MessagingController],
  providers: [MessagingService, ContentFilterService],
  exports: [MessagingService, ContentFilterService],
})
export class MessagingModule {}
