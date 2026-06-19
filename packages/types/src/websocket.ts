/** Backend MessageResponseDto ile aynı şekil (alt küme). */
export interface MessageDtoLike {
  id: string;
  threadId: string;
  senderId: string;
  senderName: string;
  receiverId: string;
  receiverName: string;
  content: string;
  status: string;
  readAt?: string | Date;
  createdAt: string | Date;
}

export interface MessageNewEvent {
  threadId: string;
  message: MessageDtoLike;
}

export interface ThreadUpdatedEvent {
  threadId: string;
  lastMessagePreview: string;
  lastMessageAt: string;
  unreadCount: number;
}

export interface MessageReadEvent {
  threadId: string;
  readerId: string;
  messageIds: string[];
}

export interface NotificationNewEvent {
  id: string;
  type: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  createdAt: string;
}

export interface TypingEvent {
  threadId: string;
  userId: string;
  displayName?: string;
}

export interface ServerToClientEvents {
  'message:new': (payload: MessageNewEvent) => void;
  'thread:updated': (payload: ThreadUpdatedEvent) => void;
  'message:read': (payload: MessageReadEvent) => void;
  'notification:new': (payload: NotificationNewEvent) => void;
  'typing:started': (payload: TypingEvent) => void;
  'typing:stopped': (payload: TypingEvent) => void;
  connected: (payload: { userId: string }) => void;
  error: (payload: { message: string }) => void;
}

export interface ClientToServerEvents {
  'join:thread': (data: { threadId: string }) => void;
  'leave:thread': (data: { threadId: string }) => void;
  'typing:start': (data: { threadId: string }) => void;
  'typing:stop': (data: { threadId: string }) => void;
}
