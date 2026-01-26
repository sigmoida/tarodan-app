import { Module, forwardRef } from '@nestjs/common';
import { MessagingController } from './messaging.controller';
import { MessagingService } from './messaging.service';
import { ContentFilterService } from './content-filter.service';
import { PrismaModule } from '../../prisma';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [PrismaModule, forwardRef(() => NotificationModule)],
  controllers: [MessagingController],
  providers: [MessagingService, ContentFilterService],
  exports: [MessagingService, ContentFilterService],
})
export class MessagingModule {}
