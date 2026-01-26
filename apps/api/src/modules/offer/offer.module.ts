import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OfferController } from './offer.controller';
import { OfferService } from './offer.service';
import { PrismaModule } from '../../prisma';
import { EventModule } from '../events';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [PrismaModule, ConfigModule, EventModule, forwardRef(() => NotificationModule)],
  controllers: [OfferController],
  providers: [OfferService],
  exports: [OfferService],
})
export class OfferModule {}
