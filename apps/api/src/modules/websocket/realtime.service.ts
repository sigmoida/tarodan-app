// apps/api/src/modules/websocket/realtime.service.ts
import { Injectable } from '@nestjs/common';
import type {
  MessageDtoLike,
  ThreadUpdatedEvent,
  NotificationNewEvent,
} from '@tarodan/types';
import { TarodanWebSocketGateway } from './websocket.gateway';

@Injectable()
export class RealtimeService {
  constructor(private readonly gateway: TarodanWebSocketGateway) {}

  emitNewMessage(
    threadId: string,
    receiverId: string,
    message: MessageDtoLike,
    threadUpdate: ThreadUpdatedEvent,
  ): void {
    this.gateway.emitToThread(threadId, 'message:new', { threadId, message });
    this.gateway.emitToUser(receiverId, 'thread:updated', threadUpdate);
  }

  emitMessageRead(threadId: string, readerId: string, messageIds: string[]): void {
    this.gateway.emitToThread(threadId, 'message:read', {
      threadId,
      readerId,
      messageIds,
    });
  }

  emitNotification(userId: string, n: NotificationNewEvent): void {
    this.gateway.emitToUser(userId, 'notification:new', n);
  }
}
