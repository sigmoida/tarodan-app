import { Module } from "@nestjs/common";
import { WishlistController } from "./wishlist.controller";
import { WishlistService } from "./wishlist.service";
import { PrismaModule } from "../../prisma";
import { CacheModule } from "../cache/cache.module";
import { NotificationModule } from "../notification/notification.module";
import { DiscountModule } from "../discount/discount.module";
import { StorageModule } from "../storage/storage.module";

import { UserBlockModule } from "../user-block/user-block.module";

@Module({
  imports: [
    PrismaModule,
    CacheModule,
    NotificationModule,
    DiscountModule,
    StorageModule,
    UserBlockModule,
  ],
  controllers: [WishlistController],
  providers: [WishlistService],
  exports: [WishlistService],
})
export class WishlistModule {}
