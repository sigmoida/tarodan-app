import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PrismaModule } from '../../prisma';
import { AuthModule } from '../auth';
import { PaymentModule } from '../payment';
import { MessagingModule } from '../messaging';
import { SupportModule } from '../support';
import { SearchModule } from '../search/search.module';
import { CacheModule } from '../cache';
import { AdvertisementModule } from '../advertisement/advertisement.module';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    PaymentModule,
    MessagingModule,
    SupportModule,
    SearchModule,
    CacheModule,
    AdvertisementModule,
    MediaModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
