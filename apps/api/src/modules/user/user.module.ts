import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { FeaturedSchedulerService } from './featured-scheduler.service';
import { NotificationModule } from '../notification/notification.module';
import { StorageModule } from '../storage/storage.module';
import { RatingModule } from '../rating/rating.module';
import { ModerationModule } from '../moderation/moderation.module';

@Module({
  imports: [ScheduleModule.forRoot(), NotificationModule, StorageModule, RatingModule, ModerationModule],
  controllers: [UserController],
  providers: [UserService, FeaturedSchedulerService],
  exports: [UserService],
})
export class UserModule {}
