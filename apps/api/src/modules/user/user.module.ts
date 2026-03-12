import { Module, forwardRef } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { NotificationModule } from '../notification/notification.module';
import { StorageModule } from '../storage/storage.module';
import { RatingModule } from '../rating/rating.module';

@Module({
  imports: [forwardRef(() => NotificationModule), StorageModule, RatingModule],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
