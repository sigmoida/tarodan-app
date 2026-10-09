import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma';
import { AdvertisementController } from './advertisement.controller';
import { AdvertisementService } from './advertisement.service';
import { AdvertisementTrackingService } from './advertisement-tracking.service';

// CacheService global modülden gelir (CacheModule @Global).
@Module({
  imports: [PrismaModule],
  controllers: [AdvertisementController],
  providers: [AdvertisementService, AdvertisementTrackingService],
  exports: [AdvertisementService],
})
export class AdvertisementModule {}
