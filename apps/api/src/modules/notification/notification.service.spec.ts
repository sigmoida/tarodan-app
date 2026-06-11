import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotificationService } from './notification.service';
import { PrismaService } from '../../prisma';
import { SendGridProvider } from './providers/sendgrid.provider';
import { ExpoPushProvider } from './providers/expo-push.provider';
import { SmsProvider } from './providers/sms.provider';
import { SmtpProvider } from './providers/smtp.provider';
import { StorageService } from '../storage/storage.service';
import { NotificationType, NotificationChannel } from './dto';

/**
 * Regression: in-app notifications must be persisted exactly once.
 *
 * send() used to call BOTH saveInAppNotification() and
 * logNotification(..., 'in_app', ...), writing two channel='in_app' rows —
 * so getInAppNotifications() surfaced every notification twice in the bell
 * ("Tekrar Satışta!" x2, "Teklifiniz iptal edildi" x2). Only saveInAppNotification
 * should persist the in_app row.
 */
describe('NotificationService in-app dedupe', () => {
  let service: NotificationService;

  const mockPrisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'user-1',
        email: 'buyer@test.dev',
        displayName: 'Alıcı',
        phone: '+905300000000',
      }),
    },
    notificationLog: {
      create: jest.fn().mockResolvedValue({ id: 'log-1' }),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({ id: 'log-1' }),
    },
  };

  const inAppCreateCalls = () =>
    mockPrisma.notificationLog.create.mock.calls.filter(
      ([arg]: [any]) => arg?.data?.channel === 'in_app',
    );

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: SendGridProvider, useValue: { sendEmail: jest.fn().mockResolvedValue({ success: true }), isConfigured: () => false } },
        { provide: ExpoPushProvider, useValue: { sendToUser: jest.fn().mockResolvedValue([{ success: true }]), registerToken: jest.fn(), isConfigured: () => false } },
        { provide: SmsProvider, useValue: { sendSms: jest.fn().mockResolvedValue({ success: true }), isConfigured: () => false } },
        { provide: SmtpProvider, useValue: { isConfigured: () => false } },
        { provide: StorageService, useValue: { getPublicAssetUrl: jest.fn().mockReturnValue(null) } },
      ],
    }).compile();

    service = module.get<NotificationService>(NotificationService);
  });

  it('writes exactly ONE in_app row when IN_APP is the only channel', async () => {
    await service.send({
      userId: 'user-1',
      type: NotificationType.BACK_IN_STOCK,
      channels: [NotificationChannel.IN_APP],
      data: { productId: 'p-1', productTitle: 'Test Ürün' },
    });

    const inApp = inAppCreateCalls();
    expect(inApp).toHaveLength(1);
    expect(inApp[0][0].data.status).toBe('sent');
  });

  it('writes exactly ONE in_app row when IN_APP is combined with PUSH', async () => {
    await service.send({
      userId: 'user-1',
      type: NotificationType.OFFER_CANCELLED_OUT_OF_STOCK,
      channels: [NotificationChannel.IN_APP, NotificationChannel.PUSH],
      data: { productId: 'p-1', productTitle: 'Test Ürün' },
    });

    // Push delivery may also be logged, but only under channel='push'.
    expect(inAppCreateCalls()).toHaveLength(1);
    const pushRows = mockPrisma.notificationLog.create.mock.calls.filter(
      ([arg]: [any]) => arg?.data?.channel === 'push',
    );
    expect(pushRows.length).toBeLessThanOrEqual(1);
  });

  it('createInAppNotification writes exactly ONE in_app row', async () => {
    await service.createInAppNotification('user-1', NotificationType.BACK_IN_STOCK, {
      productId: 'p-1',
      productTitle: 'Test Ürün',
    });

    expect(inAppCreateCalls()).toHaveLength(1);
  });

  /**
   * Collapse: rapid messages in the same thread must not stack one
   * notification per message in the bell. An unread NEW_MESSAGE for the
   * same thread is updated in place (latest preview + running count).
   */
  describe('NEW_MESSAGE per-thread collapse', () => {
    const sendNewMessage = (preview: string) =>
      service.createInAppNotification('user-1', NotificationType.NEW_MESSAGE, {
        threadId: 'thread-1',
        senderName: 'Ayşe',
        messagePreview: preview,
      });

    it('creates a new row when there is no unread notification for the thread', async () => {
      mockPrisma.notificationLog.findFirst.mockResolvedValueOnce(null);

      await sendNewMessage('Merhaba');

      expect(inAppCreateCalls()).toHaveLength(1);
      expect(mockPrisma.notificationLog.update).not.toHaveBeenCalled();
    });

    it('updates the existing unread row instead of creating a second one', async () => {
      mockPrisma.notificationLog.findFirst.mockResolvedValueOnce({
        id: 'log-existing',
        data: { threadId: 'thread-1', messageCount: 2 },
      });

      await sendNewMessage('Nasılsın?');

      expect(inAppCreateCalls()).toHaveLength(0);
      expect(mockPrisma.notificationLog.update).toHaveBeenCalledTimes(1);
      const [updateArg] = mockPrisma.notificationLog.update.mock.calls[0];
      expect(updateArg.where).toEqual({ id: 'log-existing' });
      expect(updateArg.data.title).toBe('Yeni Mesaj (3)');
      expect(updateArg.data.body).toBe('Ayşe: Nasılsın?');
      expect(updateArg.data.data.messageCount).toBe(3);
    });

    it('only collapses into UNREAD notifications (read ones start fresh)', async () => {
      mockPrisma.notificationLog.findFirst.mockResolvedValueOnce(null);

      await sendNewMessage('Tekrar merhaba');

      const [findArg] = mockPrisma.notificationLog.findFirst.mock.calls[0];
      expect(findArg.where.status).toBe('sent');
      expect(findArg.where.data).toEqual({ path: ['threadId'], equals: 'thread-1' });
      expect(inAppCreateCalls()).toHaveLength(1);
    });
  });
});
