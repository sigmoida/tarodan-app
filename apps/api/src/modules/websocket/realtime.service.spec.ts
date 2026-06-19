// apps/api/src/modules/websocket/realtime.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { RealtimeService } from './realtime.service';
import { TarodanWebSocketGateway } from './websocket.gateway';

describe('RealtimeService', () => {
  let service: RealtimeService;
  const gateway = {
    emitToThread: jest.fn(),
    emitToUser: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RealtimeService,
        { provide: TarodanWebSocketGateway, useValue: gateway },
      ],
    }).compile();
    service = module.get(RealtimeService);
  });

  it('emits message:new to thread and thread:updated to receiver', () => {
    const msg = { id: 'm1', threadId: 't1', senderId: 's1' } as any;
    const upd = { threadId: 't1', unreadCount: 2 } as any;
    service.emitNewMessage('t1', 'r1', msg, upd);
    expect(gateway.emitToThread).toHaveBeenCalledWith('t1', 'message:new', { threadId: 't1', message: msg });
    expect(gateway.emitToUser).toHaveBeenCalledWith('r1', 'thread:updated', upd);
  });

  it('emits message:read to thread', () => {
    service.emitMessageRead('t1', 'r1', ['m1', 'm2']);
    expect(gateway.emitToThread).toHaveBeenCalledWith('t1', 'message:read', {
      threadId: 't1', readerId: 'r1', messageIds: ['m1', 'm2'],
    });
  });

  it('emits notification:new to user', () => {
    const n = { id: 'n1', type: 'new_message' } as any;
    service.emitNotification('u1', n);
    expect(gateway.emitToUser).toHaveBeenCalledWith('u1', 'notification:new', n);
  });
});
