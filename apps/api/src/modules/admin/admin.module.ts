import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bull';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminAuditService } from './admin-audit.service';
import { AdminCommissionService } from './admin-commission.service';
import { AdminSettingsService } from './admin-settings.service';
import { AdminUserService } from './admin-user.service';
import { AdminStaffService } from './admin-staff.service';
import { ScheduledNotificationScheduler } from './scheduled-notification.scheduler';
import { ScheduledNotificationProcessor } from './scheduled-notification.processor';
import { QUEUE_NAMES } from '../../workers/constants';
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
import { ModerationModule } from '../moderation/moderation.module';
import { RatingModule } from '../rating/rating.module';
import { SuratCargoModule } from '../surat-cargo/surat-cargo.module';
import { RefundModule } from '../refund/refund.module';
import { NotificationModule } from '../notification/notification.module';
import { OrderModule } from '../order/order.module';

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
    RefundModule,
    NotificationModule,
    OrderModule,
    ModerationModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.SCHEDULED }),
  ],
  controllers: [AdminController],
  providers: [AdminService, AdminAuditService, AdminCommissionService, AdminSettingsService, AdminUserService, AdminStaffService, ScheduledNotificationScheduler, ScheduledNotificationProcessor],
  exports: [AdminService],
})
export class AdminModule { }
