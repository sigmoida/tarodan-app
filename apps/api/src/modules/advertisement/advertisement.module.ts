import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma';
import { MediaModule } from '../media/media.module';
import { AdvertisementController } from './advertisement.controller';
import { AdvertisementService } from './advertisement.service';
import { AdvertisementTrackingService } from './advertisement-tracking.service';

// CacheService global modülden gelir (CacheModule @Global).
@Module({
  imports: [PrismaModule, MediaModule],
  controllers: [AdvertisementController],
  providers: [AdvertisementService, AdvertisementTrackingService],
  exports: [AdvertisementService],
})
export class AdvertisementModule {}
