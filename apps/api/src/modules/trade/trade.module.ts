import { Module, forwardRef } from '@nestjs/common';
import { TradeController } from './trade.controller';
import { TradeService } from './trade.service';
import { PrismaModule } from '../../prisma';
import { CacheModule } from '../cache/cache.module';
import { MembershipModule } from '../membership/membership.module';
import { NotificationModule } from '../notification/notification.module';
import { StorageModule } from '../storage/storage.module';
import { PaymentModule } from '../payment/payment.module';

@Module({
  imports: [PrismaModule, CacheModule, MembershipModule, forwardRef(() => NotificationModule), StorageModule, PaymentModule],
  controllers: [TradeController],
  providers: [TradeService],
  exports: [TradeService],
})
export class TradeModule {}
