import { Module, forwardRef } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { NotificationModule } from '../notification/notification.module';
import { StorageModule } from '../storage/storage.module';
import { RatingModule } from '../rating/rating.module';
import { ModerationModule } from '../moderation/moderation.module';

@Module({
  imports: [forwardRef(() => NotificationModule), StorageModule, RatingModule, ModerationModule],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
