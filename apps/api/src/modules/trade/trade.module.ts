import { Module, forwardRef } from '@nestjs/common';
import { TradeController } from './trade.controller';
import { TradeService } from './trade.service';
import { PrismaModule } from '../../prisma';
import { MembershipModule } from '../membership/membership.module';
import { NotificationModule } from '../notification/notification.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [PrismaModule, MembershipModule, forwardRef(() => NotificationModule), StorageModule],
  controllers: [TradeController],
  providers: [TradeService],
  exports: [TradeService],
})
export class TradeModule {}
