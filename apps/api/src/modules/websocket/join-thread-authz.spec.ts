import { TarodanWebSocketGateway } from './websocket.gateway';

describe('TarodanWebSocketGateway handleJoinThread authorization', () => {
  let gateway: TarodanWebSocketGateway;
  const mockPrisma = {
    messageThread: {
      findUnique: jest.fn().mockResolvedValue({
        id: 't1',
        participant1Id: 'u1',
        participant2Id: 'u2',
      }),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    gateway = new TarodanWebSocketGateway(
      {} as any, // jwtService
      {} as any, // configService
      mockPrisma as any,
    );
  });

  const makeClient = (userId: string) => ({
    userId,
    join: jest.fn(),
    emit: jest.fn(),
  });

  it('lets a participant join the thread room', async () => {
    const client = makeClient('u1');
    const res = await gateway.handleJoinThread(client as any, { threadId: 't1' });
    expect(client.join).toHaveBeenCalledWith('thread:t1');
    expect(client.emit).not.toHaveBeenCalledWith('error', expect.anything());
    expect(res).toEqual({ event: 'joined:thread', data: { threadId: 't1' } });
  });

  it('rejects a non-participant: no join, emits error', async () => {
    const client = makeClient('intruder');
    const res = await gateway.handleJoinThread(client as any, { threadId: 't1' });
    expect(client.join).not.toHaveBeenCalled();
    expect(client.emit).toHaveBeenCalledWith('error', {
      message: 'Bu konuya erişim yetkiniz yok',
    });
    expect(res).toEqual({ event: 'error', data: { threadId: 't1' } });
  });
});
