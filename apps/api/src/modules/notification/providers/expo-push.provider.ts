/**
 * Expo Push Notification Provider
 * GAP-014: Real Notification Providers (Expo, SendGrid, SMS)
 *
 * Requirement: Push notifications for iOS & Android (project.md)
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma';

export interface ExpoPushMessage {
  to: string | string[]; // Expo push token(s)
  title: string;
  body: string;
  data?: Record<string, any>;
  sound?: 'default' | null;
  badge?: number;
  channelId?: string;
  priority?: 'default' | 'normal' | 'high';
  ttl?: number; // Time to live in seconds
  subtitle?: string; // iOS only
}

export interface ExpoPushTicket {
  id?: string;
  status: 'ok' | 'error';
  message?: string;
  details?: {
    error?: string;
    expoPushToken?: string;
  };
}

export interface ExpoPushReceipt {
  status: 'ok' | 'error';
  message?: string;
  details?: {
    error?: string;
  };
}

export interface PushNotificationResult {
  success: boolean;
  ticketId?: string;
  error?: string;
}

@Injectable()
export class ExpoPushProvider {
  private readonly logger = new Logger(ExpoPushProvider.name);
  private readonly expoApiUrl = 'https://exp.host/--/api/v2/push/send';
  private readonly expoReceiptsUrl = 'https://exp.host/--/api/v2/push/getReceipts';
  private readonly accessToken: string;
  private readonly enabled: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.accessToken = this.configService.get<string>('EXPO_ACCESS_TOKEN', '');
    this.enabled = !!this.accessToken;

    if (!this.enabled) {
      this.logger.warn('Expo Push is not configured. Push notifications will be logged only.');
    }
  }

  /**
   * Validate Expo push token format
   */
  isValidExpoToken(token: string): boolean {
    return /^ExponentPushToken\[.+\]$/.test(token) || /^ExpoPushToken\[.+\]$/.test(token);
  }

  /**
   * Send push notification to a single device
   */
  async sendPushNotification(message: ExpoPushMessage): Promise<PushNotificationResult> {
    // Validate token
    const tokens = Array.isArray(message.to) ? message.to : [message.to];
    const validTokens = tokens.filter((t) => this.isValidExpoToken(t));

    if (validTokens.length === 0) {
      this.logger.warn(`No valid Expo push tokens provided`);
      return { success: false, error: 'No valid Expo push tokens' };
    }

    // Not: Expo Push endpoint'i access-token OLMADAN da çalışır (token yalnızca
    // "Enhanced Security" açıkken gerekir). Eskiden token yoksa mock'lanıp hiç
    // gönderilmiyordu → refund/admin manuel push'ları sessizce kayboluyordu.
    // Artık her zaman gerçek gönderiyoruz; auth header sadece token varsa eklenir.
    // (Token tablosu boşsa zaten yukarıda erken dönülüyor; dev/CI'da Expo'ya
    // istek gitmez.)
    try {
      const payload = {
        to: validTokens.length === 1 ? validTokens[0] : validTokens,
        title: message.title,
        body: message.body,
        data: message.data,
        sound: message.sound ?? 'default',
        badge: message.badge,
        channelId: message.channelId ?? 'default',
        priority: message.priority ?? 'high',
        ttl: message.ttl ?? 86400, // 24 hours default
        subtitle: message.subtitle,
      };

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };

      if (this.accessToken) {
        headers['Authorization'] = `Bearer ${this.accessToken}`;
      }

      const response = await fetch(this.expoApiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(`Expo Push API error: ${response.status} - ${error}`);
        return { success: false, error: `Expo API error: ${response.status}` };
      }

      const result = await response.json();
      const ticket = result.data as ExpoPushTicket;

      if (ticket.status === 'error') {
        this.logger.error(`Expo Push error: ${ticket.message}`);
        return { success: false, error: ticket.message };
      }

      this.logger.log(`Push notification sent via Expo, ticket: ${ticket.id}`);
      return { success: true, ticketId: ticket.id };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to send push notification via Expo: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Send push notifications in batch (max 100 at a time)
   */
  async sendBatchPushNotifications(
    messages: ExpoPushMessage[],
  ): Promise<PushNotificationResult[]> {
    const results: PushNotificationResult[] = [];
    const batchSize = 100;

    for (let i = 0; i < messages.length; i += batchSize) {
      const batch = messages.slice(i, i + batchSize);

      // Access-token olmadan da gerçek gönderiyoruz (bkz. sendPushNotification notu).
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        };

        if (this.accessToken) {
          headers['Authorization'] = `Bearer ${this.accessToken}`;
        }

        const response = await fetch(this.expoApiUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(batch),
        });

        if (!response.ok) {
          const error = await response.text();
          this.logger.error(`Expo batch push error: ${response.status}`);
          batch.forEach(() => results.push({ success: false, error }));
          continue;
        }

        const result = await response.json();
        const tickets = result.data as ExpoPushTicket[];

        for (const ticket of tickets) {
          if (ticket.status === 'error') {
            results.push({ success: false, error: ticket.message });
          } else {
            results.push({ success: true, ticketId: ticket.id });
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        batch.forEach(() => results.push({ success: false, error: errorMessage }));
      }
    }

    return results;
  }

  /**
   * Get push notification receipts (to check delivery status)
   */
  async getReceipts(ticketIds: string[]): Promise<Record<string, ExpoPushReceipt>> {
    if (!this.enabled || ticketIds.length === 0) {
      return {};
    }

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };

      if (this.accessToken) {
        headers['Authorization'] = `Bearer ${this.accessToken}`;
      }

      const response = await fetch(this.expoReceiptsUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ids: ticketIds }),
      });

      if (!response.ok) {
        this.logger.error(`Failed to get Expo receipts: ${response.status}`);
        return {};
      }

      const result = await response.json();
      return result.data as Record<string, ExpoPushReceipt>;
    } catch (error) {
      this.logger.error(`Error getting Expo receipts: ${error}`);
      return {};
    }
  }

  /**
   * Send push notification to a user by user ID
   */
  async sendToUser(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, any>,
  ): Promise<PushNotificationResult[]> {
    // Get user's push tokens
    const tokens = await this.prisma.pushToken.findMany({
      where: { userId, isActive: true },
      select: { token: true },
    });

    if (tokens.length === 0) {
      this.logger.warn(`No push tokens found for user ${userId}`);
      return [{ success: false, error: 'No push tokens found for user' }];
    }

    const validTokens = tokens
      .map((t) => t.token)
      .filter((t) => this.isValidExpoToken(t));

    if (validTokens.length === 0) {
      return [{ success: false, error: 'No valid Expo tokens for user' }];
    }

    const results: PushNotificationResult[] = [];

    for (const token of validTokens) {
      const result = await this.sendPushNotification({
        to: token,
        title,
        body,
        data,
      });
      results.push(result);
    }

    return results;
  }

  /**
   * Register push token for a user
   */
  async registerToken(
    userId: string,
    token: string,
    platform: 'ios' | 'android',
    deviceId?: string,
  ): Promise<void> {
    if (!this.isValidExpoToken(token)) {
      throw new Error('Invalid Expo push token format');
    }

    // Upsert the token
    await this.prisma.pushToken.upsert({
      where: {
        userId_token: { userId, token },
      },
      update: {
        platform,
        deviceId,
        isActive: true,
        updatedAt: new Date(),
      },
      create: {
        userId,
        token,
        platform,
        deviceId,
        isActive: true,
      },
    });

    this.logger.log(`Push token registered for user ${userId}, platform: ${platform}`);
  }

  /**
   * Deactivate a push token
   */
  async deactivateToken(token: string): Promise<void> {
    await this.prisma.pushToken.updateMany({
      where: { token },
      data: { isActive: false },
    });

    this.logger.log(`Push token deactivated: ${token.substring(0, 30)}...`);
  }

  /**
   * Check if Expo Push is properly configured
   */
  isConfigured(): boolean {
    return this.enabled;
  }
}
