// messagesApi'yi mock'la: markAsRead re-sync (fetchUnreadCount) sunucu gerçeğini döndürsün.
jest.mock('../../services/api', () => ({
  messagesApi: {
    markAsRead: jest.fn(() => Promise.resolve({ data: {} })),
    getUnreadCount: jest.fn(() => Promise.resolve({ data: { count: 0 } })),
  },
}));

import { useMessagesStore } from '../messagesStore';
import { useAuthStore } from '../authStore';

describe('okunmamış rozet (totalUnreadCount) davranışı', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: { id: 'me' } as any });
    useMessagesStore.setState({
      currentThreadId: null,
      messages: [],
      threads: [{ id: 't1', unreadCount: 0 } as any],
      totalUnreadCount: 0,
    });
  });

  it('açık olmayan thread\'e başkasından mesaj gelince sayaçlar artar', () => {
    useMessagesStore.getState().applyIncomingMessage('t1', {
      id: 'm1', threadId: 't1', senderId: 'other', createdAt: '2026-06-22T10:00:00Z',
    } as any);
    expect(useMessagesStore.getState().totalUnreadCount).toBe(1);
    expect(useMessagesStore.getState().threads.find((t: any) => t.id === 't1')!.unreadCount).toBe(1);
  });

  it('kendi gönderdiğim mesaj sayacı artırmaz', () => {
    useMessagesStore.getState().applyIncomingMessage('t1', {
      id: 'm2', threadId: 't1', senderId: 'me', createdAt: '2026-06-22T10:01:00Z',
    } as any);
    expect(useMessagesStore.getState().totalUnreadCount).toBe(0);
  });

  it('açık thread\'e gelen mesaj sayacı artırmaz', () => {
    useMessagesStore.setState({ currentThreadId: 't1' });
    useMessagesStore.getState().applyIncomingMessage('t1', {
      id: 'm3', threadId: 't1', senderId: 'other', createdAt: '2026-06-22T10:02:00Z',
    } as any);
    expect(useMessagesStore.getState().totalUnreadCount).toBe(0);
  });

  it('markAsRead, thread.unreadCount yerelde 0 olsa bile rozeti sunucu gerçeğine (0) senkronlar', async () => {
    // Senaryo: socket mesajı totalUnreadCount=1 yaptı ama thread.unreadCount yerelde takılı 0.
    useMessagesStore.setState({ totalUnreadCount: 1, threads: [{ id: 't1', unreadCount: 0 } as any] });
    await useMessagesStore.getState().markAsRead('t1');
    expect(useMessagesStore.getState().totalUnreadCount).toBe(0);
  });
});
