import { MessageStatus } from "@prisma/client";

export class MessageResponseDto {
  id: string;
  threadId: string;
  senderId: string;
  senderName: string;
  receiverId: string;
  receiverName: string;
  content: string; // Original or filtered based on status
  status: MessageStatus;
  flaggedReason?: string;
  readAt?: Date;
  createdAt: Date;
}

export class MessageThreadResponseDto {
  id: string;
  participant1Id: string;
  participant1Name: string;
  participant1AvatarUrl?: string | null;
  participant2Id: string;
  participant2Name: string;
  participant2AvatarUrl?: string | null;
  productId?: string;
  productTitle?: string;
  productImage?: string | null;
  lastMessage?: MessageResponseDto;
  unreadCount: number;
  lastMessageAt: Date;
  createdAt: Date;
}

export class ThreadListResponseDto {
  threads: MessageThreadResponseDto[];
  total: number;
  page: number;
  pageSize: number;
}

export class MessageListResponseDto {
  messages: MessageResponseDto[];
  total: number;
  page: number;
  pageSize: number;
}

export class PendingMessagesResponseDto {
  messages: Array<{
    id: string;
    threadId: string;
    senderId: string;
    senderName: string;
    receiverId: string;
    receiverName: string;
    originalContent: string;
    flaggedReason: string;
    createdAt: Date;
  }>;
  total: number;
  page: number;
  pageSize: number;
}
