import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { ScheduledNotificationScheduler } from './scheduled-notification.scheduler';
import { PrismaModule } from '../../prisma';
import { AuthModule } from '../auth';
import { PaymentModule } from '../payment';
import { MessagingModule } from '../messaging';
import { SupportModule } from '../support';
import { SearchModule } from '../search/search.module';
import { CacheModule } from '../cache';
import { AdvertisementModule } from '../advertisement/advertisement.module';
import { MediaModule } from '../media/media.module';
import { DiscountModule } from '../discount/discount.module';
import { EventModule } from '../events/event.module';
import { StorageModule } from '../storage/storage.module';
import { RatingModule } from '../rating/rating.module';
import { SuratCargoModule } from '../surat-cargo/surat-cargo.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    PaymentModule,
    MessagingModule,
    SupportModule,
    SearchModule,
    CacheModule,
    AdvertisementModule,
    MediaModule,
    DiscountModule,
    EventModule,
    StorageModule,
    RatingModule,
    SuratCargoModule,
  ],
  controllers: [AdminController],
  providers: [AdminService, ScheduledNotificationScheduler],
  exports: [AdminService],
})
export class AdminModule { }
