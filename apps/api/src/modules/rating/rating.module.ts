import { Module } from '@nestjs/common';
import { RatingController } from './rating.controller';
import { RatingService } from './rating.service';
import { PrismaModule } from '../../prisma';
import { CacheModule } from '../cache/cache.module';
import { NotificationModule } from '../notification/notification.module';
import { StorageModule } from '../storage/storage.module';
import { ModerationModule } from '../moderation/moderation.module';

@Module({
  imports: [PrismaModule, CacheModule, NotificationModule, StorageModule, ModerationModule],
  controllers: [RatingController],
  providers: [RatingService],
  exports: [RatingService],
})
export class RatingModule {}
