import { Module, forwardRef } from '@nestjs/common';
import { RatingController } from './rating.controller';
import { RatingService } from './rating.service';
import { PrismaModule } from '../../prisma';
import { CacheModule } from '../cache/cache.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [PrismaModule, CacheModule, forwardRef(() => NotificationModule)],
  controllers: [RatingController],
  providers: [RatingService],
  exports: [RatingService],
})
export class RatingModule {}
