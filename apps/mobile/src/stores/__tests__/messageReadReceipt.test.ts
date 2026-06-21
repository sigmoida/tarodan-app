import { useMessagesStore } from '../messagesStore';

describe('okundu (read receipt) store davranışı', () => {
  beforeEach(() => {
    useMessagesStore.setState({
      currentThreadId: 't1',
      messages: [
        { id: 'm1', threadId: 't1', senderId: 'me', status: 'sent', createdAt: '2026-06-22T10:00:00Z' } as any,
        { id: 'm2', threadId: 't1', senderId: 'me', status: 'delivered', createdAt: '2026-06-22T10:01:00Z' } as any,
        { id: 'm3', threadId: 'OTHER', senderId: 'me', status: 'sent', createdAt: '2026-06-22T10:02:00Z' } as any,
      ],
      threads: [{ id: 't1', unreadCount: 3 } as any],
      totalUnreadCount: 3,
    });
  });

  it('applyMessagesRead yalnız verilen id\'leri read yapar', () => {
    useMessagesStore.getState().applyMessagesRead('t1', ['m2']);
    const msgs = useMessagesStore.getState().messages;
    expect(msgs.find((m: any) => m.id === 'm1')!.status).toBe('sent');
    expect(msgs.find((m: any) => m.id === 'm2')!.status).toBe('read');
    expect(msgs.find((m: any) => m.id === 'm2')!.readAt).toBeTruthy();
  });

  it('applyMessagesRead başka thread\'in mesajını etkilemez', () => {
    useMessagesStore.getState().applyMessagesRead('t1', ['m3']); // m3 OTHER thread'inde
    expect(useMessagesStore.getState().messages.find((m: any) => m.id === 'm3')!.status).toBe('sent');
  });

  it('markAsRead kendi mesajlarımın status\'unu değiştirmez (read receipt bozulmaz)', async () => {
    await useMessagesStore.getState().markAsRead('t1');
    const msgs = useMessagesStore.getState().messages;
    expect(msgs.find((m: any) => m.id === 'm1')!.status).toBe('sent');
    expect(msgs.find((m: any) => m.id === 'm2')!.status).toBe('delivered');
    // sayaç sıfırlanır
    expect(useMessagesStore.getState().threads.find((t: any) => t.id === 't1')!.unreadCount).toBe(0);
    expect(useMessagesStore.getState().totalUnreadCount).toBe(0);
  });
});
