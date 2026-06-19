import { useMessagesStore } from '../messagesStore';

describe('applyIncomingMessage', () => {
  beforeEach(() => {
    useMessagesStore.setState({
      currentThreadId: 't1',
      messages: [{ id: 'm1', threadId: 't1', createdAt: '2026-06-19T10:00:00Z' } as any],
      threads: [],
    });
  });

  it('appends a new message for the open thread with dedupe', () => {
    const store = useMessagesStore.getState();
    store.applyIncomingMessage('t1', { id: 'm2', threadId: 't1', createdAt: '2026-06-19T10:01:00Z' } as any);
    expect(useMessagesStore.getState().messages.map((m: any) => m.id)).toEqual(['m1', 'm2']);
    // dedupe
    store.applyIncomingMessage('t1', { id: 'm2', threadId: 't1', createdAt: '2026-06-19T10:01:00Z' } as any);
    expect(useMessagesStore.getState().messages.length).toBe(2);
  });

  it('does NOT append to messages when thread is not open', () => {
    const store = useMessagesStore.getState();
    store.applyIncomingMessage('OTHER', { id: 'x', threadId: 'OTHER', createdAt: '2026-06-19T10:05:00Z' } as any);
    expect(useMessagesStore.getState().messages.map((m: any) => m.id)).toEqual(['m1']);
  });
});
