import { Module, forwardRef } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bull';
import { TradeController } from './trade.controller';
import { TradeService } from './trade.service';
import { TradeShipmentService } from './trade-shipment.service';
import { TradeCommonService } from './trade-common.service';
import { TradeQueryService } from './trade-query.service';
import { TradeLifecycleService } from './trade-lifecycle.service';
import { TradeSchedulerService } from './trade-scheduler.service';
import { TradeScheduledProcessor } from './trade-scheduled.processor';
import { QUEUE_NAMES } from '../../workers/constants';
import { PrismaModule } from '../../prisma';
import { CacheModule } from '../cache/cache.module';
import { MembershipModule } from '../membership/membership.module';
import { NotificationModule } from '../notification/notification.module';
import { StorageModule } from '../storage/storage.module';
import { PaymentModule } from '../payment/payment.module';
import { ProductModule } from '../product/product.module';
import { EventModule } from '../events';
import { SuratCargoModule } from '../surat-cargo/surat-cargo.module';

@Module({
  imports: [ScheduleModule.forRoot(), PrismaModule, CacheModule, MembershipModule, forwardRef(() => NotificationModule), StorageModule, PaymentModule, ProductModule, EventModule, SuratCargoModule, BullModule.registerQueue({ name: QUEUE_NAMES.SCHEDULED })],
  controllers: [TradeController],
  providers: [TradeService, TradeShipmentService, TradeCommonService, TradeQueryService, TradeLifecycleService, TradeSchedulerService, TradeScheduledProcessor],
  exports: [TradeService],
})
export class TradeModule {}
