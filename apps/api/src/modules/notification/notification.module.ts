/**
 * Notification Module
 * GAP-014: Real Notification Providers (Expo, SendGrid, SMS)
 *
 * Provides complete notification functionality with real provider integrations
 */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { PrismaModule } from '../../prisma';
import { SendGridProvider } from './providers/sendgrid.provider';
import { ExpoPushProvider } from './providers/expo-push.provider';
import { SmsProvider } from './providers/sms.provider';
import { SmtpProvider } from './providers/smtp.provider';

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [NotificationController],
  providers: [
    NotificationService,
    SendGridProvider,
    ExpoPushProvider,
    SmsProvider,
    SmtpProvider,
  ],
  exports: [
    NotificationService,
    SendGridProvider,
    ExpoPushProvider,
    SmsProvider,
    SmtpProvider,
  ],
})
export class NotificationModule {}
