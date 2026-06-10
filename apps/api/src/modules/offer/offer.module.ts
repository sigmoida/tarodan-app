import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { OfferController } from './offer.controller';
import { OfferService } from './offer.service';
import { OfferSchedulerService } from './offer-scheduler.service';
import { PrismaModule } from '../../prisma';
import { CacheModule } from '../cache/cache.module';
import { EventModule } from '../events';
import { NotificationModule } from '../notification/notification.module';
import { StorageModule } from '../storage/storage.module';
import { OrderModule } from '../order/order.module';
import { ProductModule } from '../product/product.module';

@Module({
  imports: [ScheduleModule.forRoot(), PrismaModule, ConfigModule, CacheModule, EventModule, forwardRef(() => NotificationModule), StorageModule, forwardRef(() => OrderModule), ProductModule],
  controllers: [OfferController],
  providers: [OfferService, OfferSchedulerService],
  exports: [OfferService, OfferSchedulerService],
})
export class OfferModule {}
