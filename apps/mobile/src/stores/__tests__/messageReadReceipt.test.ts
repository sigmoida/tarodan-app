import { QueryClient } from '@tanstack/react-query';
import { qk } from '@/lib/query';
import { applyMessagesReadToCache, applyThreadReadToCache } from '@/lib/messaging/cache';
import type { Message, MessageThread } from '../messagesStore';

// #77: applyMessagesRead / markAsRead store action'ları → setQueryData köprüsü.
describe('okundu (read receipt) cache davranışı', () => {
  let qc: QueryClient;

  beforeEach(() => {
    qc = new QueryClient();
    qc.setQueryData(qk.messaging.messages('t1'), [
      { id: 'm1', threadId: 't1', senderId: 'me', status: 'sent', createdAt: '2026-06-22T10:00:00Z' },
      { id: 'm2', threadId: 't1', senderId: 'me', status: 'delivered', createdAt: '2026-06-22T10:01:00Z' },
    ] as Message[]);
    qc.setQueryData(qk.messaging.messages('OTHER'), [
      { id: 'm3', threadId: 'OTHER', senderId: 'me', status: 'sent', createdAt: '2026-06-22T10:02:00Z' },
    ] as Message[]);
    qc.setQueryData(qk.messaging.threads, [{ id: 't1', unreadCount: 3 } as MessageThread]);
    qc.setQueryData(qk.messaging.unreadCount, 3);
  });

  const msgs = (tid: string) => qc.getQueryData<Message[]>(qk.messaging.messages(tid))!;

  it('applyMessagesReadToCache yalnız verilen id\'leri read yapar', () => {
    applyMessagesReadToCache(qc, 't1', ['m2']);
    expect(msgs('t1').find((m) => m.id === 'm1')!.status).toBe('sent');
    expect(msgs('t1').find((m) => m.id === 'm2')!.status).toBe('read');
    expect(msgs('t1').find((m) => m.id === 'm2')!.readAt).toBeTruthy();
  });

  it('applyMessagesReadToCache başka thread\'in mesajını etkilemez', () => {
    applyMessagesReadToCache(qc, 't1', ['m3']); // m3 OTHER thread'inde
    expect(msgs('OTHER').find((m) => m.id === 'm3')!.status).toBe('sent');
  });

  it('markAsRead (applyThreadReadToCache) kendi mesajlarımın status\'unu değiştirmez', () => {
    applyThreadReadToCache(qc, 't1');
    expect(msgs('t1').find((m) => m.id === 'm1')!.status).toBe('sent');
    expect(msgs('t1').find((m) => m.id === 'm2')!.status).toBe('delivered');
    // sayaçlar optimistik sıfırlanır
    expect(qc.getQueryData<MessageThread[]>(qk.messaging.threads)!.find((t) => t.id === 't1')!.unreadCount).toBe(0);
    expect(qc.getQueryData<number>(qk.messaging.unreadCount)).toBe(0);
  });
});
