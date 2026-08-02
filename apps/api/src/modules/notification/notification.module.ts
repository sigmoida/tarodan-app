/**
 * Notification Module
 * GAP-014: Real Notification Providers (Expo, SMTP, SMS)
 *
 * Provides complete notification functionality with real provider integrations
 */
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { NotificationController } from "./notification.controller";
import { NotificationService } from "./notification.service";
import { NotificationDispatchService } from "./notification-dispatch.service";
import { NotificationCommerceService } from "./notification-commerce.service";
import { NotificationAccountService } from "./notification-account.service";
import { PrismaModule } from "../../prisma";
import { StorageModule } from "../storage/storage.module";
import { WebSocketModule } from "../websocket/websocket.module";
import { ExpoPushProvider } from "./providers/expo-push.provider";
import { SmsProvider } from "./providers/sms.provider";
import { NetGsmProvider } from "./providers/netgsm.provider";
import { MailModule } from "../mail/mail.module";

@Module({
  // MailModule is re-exported so existing consumers that import
  // NotificationModule (invoice, marketing, product) keep resolving SmtpProvider
  // — from the one shared instance, not a local copy.
  imports: [
    PrismaModule,
    ConfigModule,
    StorageModule,
    WebSocketModule,
    MailModule,
  ],
  controllers: [NotificationController],
  providers: [
    NotificationService,
    NotificationDispatchService,
    NotificationCommerceService,
    NotificationAccountService,
    ExpoPushProvider,
    SmsProvider,
    NetGsmProvider,
  ],
  exports: [
    NotificationService,
    ExpoPushProvider,
    SmsProvider,
    NetGsmProvider,
    MailModule,
  ],
})
export class NotificationModule {}
