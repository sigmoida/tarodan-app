// apps/api/src/modules/messaging/messaging-read-since.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { MessagingService } from './messaging.service';
import { ContentFilterService } from './content-filter.service';
import { NotificationService } from '../notification/notification.service';
import { RealtimeService } from '../websocket/realtime.service';
import { StorageService } from '../storage/storage.service';
import { PrismaService } from '../../prisma';

describe('MessagingService getThreadMessages read+since', () => {
  let service: MessagingService;
  const realtime = { emitNewMessage: jest.fn(), emitMessageRead: jest.fn() };
  const mockPrisma = {
    messageThread: { findUnique: jest.fn().mockResolvedValue({ id: 't1', participant1Id: 'u1', participant2Id: 'u2' }) },
    message: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'm2', threadId: 't1', senderId: 'u2', receiverId: 'u1', content: 'hi', status: 'sent', createdAt: new Date(), readAt: null, sender: { id: 'u2', displayName: 'V' }, receiver: { id: 'u1', displayName: 'A' } },
      ]),
      count: jest.fn().mockResolvedValue(1),
      findMany2: undefined,
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ContentFilterService, useValue: {} },
        { provide: NotificationService, useValue: {} },
        { provide: RealtimeService, useValue: realtime },
        { provide: StorageService, useValue: {} },
      ],
    }).compile();
    service = module.get(MessagingService);
  });

  it('applies since filter to the message query', async () => {
    const since = '2026-06-19T00:00:00.000Z';
    await service.getThreadMessages('t1', 'u1', { page: 1, pageSize: 50, since } as any);
    const whereArg = mockPrisma.message.findMany.mock.calls[0][0].where;
    expect(whereArg.createdAt).toEqual({ gt: new Date(since) });
  });

  it('emits message:read for newly read message ids', async () => {
    await service.getThreadMessages('t1', 'u1', { page: 1, pageSize: 50 } as any);
    expect(realtime.emitMessageRead).toHaveBeenCalledWith('t1', 'u1', expect.arrayContaining(['m2']));
  });
});
