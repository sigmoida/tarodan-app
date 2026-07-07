import { Module } from '@nestjs/common';
import { WishlistController } from './wishlist.controller';
import { WishlistService } from './wishlist.service';
import { PrismaModule } from '../../prisma';
import { CacheModule } from '../cache/cache.module';
import { NotificationModule } from '../notification/notification.module';
import { DiscountModule } from '../discount/discount.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [PrismaModule, CacheModule, NotificationModule, DiscountModule, StorageModule],
  controllers: [WishlistController],
  providers: [WishlistService],
  exports: [WishlistService],
})
export class WishlistModule { }

