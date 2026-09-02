import { Module } from "@nestjs/common";
import { UserBlockModule } from "../user-block/user-block.module";
import { MessagingController } from "./messaging.controller";
import { MessagingService } from "./messaging.service";
import { ContentFilterService } from "./content-filter.service";
import { PrismaModule } from "../../prisma";
import { NotificationModule } from "../notification/notification.module";
import { StorageModule } from "../storage/storage.module";
import { ModerationModule } from "../moderation/moderation.module";
import { WebSocketModule } from "../websocket/websocket.module";

@Module({
  imports: [
    PrismaModule,
    NotificationModule,
    StorageModule,
    ModerationModule,
    WebSocketModule,
    UserBlockModule,
  ],
  controllers: [MessagingController],
  providers: [MessagingService, ContentFilterService],
  exports: [MessagingService, ContentFilterService],
})
export class MessagingModule {}
