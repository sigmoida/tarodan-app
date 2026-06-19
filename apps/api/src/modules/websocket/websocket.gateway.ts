/**
 * WebSocket Gateway
 * Real-time communication for messaging, notifications, and live updates
 */
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  user?: {
    id: string;
    email: string;
    displayName: string;
    role: string;
  };
}

@WebSocketGateway({
  cors: {
    origin: [
      'http://localhost:3000',
      'http://localhost:3002',
      'https://tarodan.com',
      'https://admin.tarodan.com',
    ],
    credentials: true,
  },
  namespace: '/',
  transports: ['websocket', 'polling'],
})
export class TarodanWebSocketGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(TarodanWebSocketGateway.name);
  private connectedUsers: Map<string, Set<string>> = new Map(); // userId -> socketIds

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  afterInit(server: Server) {
    this.logger.log('WebSocket Gateway initialized');
  }

  async handleConnection(client: AuthenticatedSocket) {
    try {
      // Extract token from handshake
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        this.logger.warn(`Client ${client.id} connected without authentication`);
        client.emit('error', { message: 'Authentication required' });
        client.disconnect();
        return;
      }

      // Verify JWT
      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.get('JWT_SECRET'),
      });

      client.userId = payload.sub;
      client.user = {
        id: payload.sub,
        email: payload.email,
        displayName: payload.displayName,
        role: payload.role,
      };

      // Track connected user
      const userId = client.userId;
      if (userId) {
        if (!this.connectedUsers.has(userId)) {
          this.connectedUsers.set(userId, new Set());
        }
        this.connectedUsers.get(userId)!.add(client.id);
      }

      // Join user's personal room
      client.join(`user:${client.userId}`);

      this.logger.log(`User ${client.userId} connected (socket: ${client.id})`);
      client.emit('connected', { userId: client.userId });
    } catch (error) {
      this.logger.error(`Authentication failed for client ${client.id}: ${error.message}`);
      client.emit('error', { message: 'Invalid authentication token' });
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    if (client.userId) {
      const userSockets = this.connectedUsers.get(client.userId);
      if (userSockets) {
        userSockets.delete(client.id);
        if (userSockets.size === 0) {
          this.connectedUsers.delete(client.userId);
        }
      }
      this.logger.log(`User ${client.userId} disconnected (socket: ${client.id})`);
    }
  }

  // ==================== MESSAGING ====================

  @SubscribeMessage('join:thread')
  handleJoinThread(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { threadId: string },
  ) {
    client.join(`thread:${data.threadId}`);
    this.logger.log(`User ${client.userId} joined thread ${data.threadId}`);
    return { event: 'joined:thread', data: { threadId: data.threadId } };
  }

  @SubscribeMessage('leave:thread')
  handleLeaveThread(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { threadId: string },
  ) {
    client.leave(`thread:${data.threadId}`);
    this.logger.log(`User ${client.userId} left thread ${data.threadId}`);
    return { event: 'left:thread', data: { threadId: data.threadId } };
  }

  @SubscribeMessage('typing:start')
  handleTypingStart(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { threadId: string },
  ) {
    client.to(`thread:${data.threadId}`).emit('typing:started', {
      threadId: data.threadId,
      userId: client.userId,
      displayName: client.user?.displayName,
    });
  }

  @SubscribeMessage('typing:stop')
  handleTypingStop(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { threadId: string },
  ) {
    client.to(`thread:${data.threadId}`).emit('typing:stopped', {
      threadId: data.threadId,
      userId: client.userId,
    });
  }

  // ==================== NOTIFICATIONS ====================

  /**
   * Send notification to specific user
   */
  sendNotificationToUser(userId: string, notification: any) {
    this.server.to(`user:${userId}`).emit('notification:new', notification);
    this.logger.debug(`Notification sent to user ${userId}`);
  }

  /**
   * Send notification to multiple users
   */
  sendNotificationToUsers(userIds: string[], notification: any) {
    userIds.forEach((userId) => {
      this.sendNotificationToUser(userId, notification);
    });
  }

  /**
   * Broadcast notification to all connected users
   */
  broadcastNotification(notification: any) {
    this.server.emit('notification:broadcast', notification);
    this.logger.debug('Broadcast notification sent');
  }

  // ==================== ORDER UPDATES ====================

  @SubscribeMessage('order:subscribe')
  handleOrderSubscribe(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { orderId: string },
  ) {
    client.join(`order:${data.orderId}`);
    this.logger.log(`User ${client.userId} subscribed to order ${data.orderId}`);
    return { event: 'order:subscribed', data: { orderId: data.orderId } };
  }

  /**
   * Send order status update
   */
  sendOrderUpdate(orderId: string, update: any) {
    this.server.to(`order:${orderId}`).emit('order:updated', {
      orderId,
      ...update,
      timestamp: new Date().toISOString(),
    });
  }

  // ==================== PRODUCT UPDATES ====================

  @SubscribeMessage('product:subscribe')
  handleProductSubscribe(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { productId: string },
  ) {
    client.join(`product:${data.productId}`);
    return { event: 'product:subscribed', data: { productId: data.productId } };
  }

  /**
   * Send product update (price change, sold, etc.)
   */
  sendProductUpdate(productId: string, update: any) {
    this.server.to(`product:${productId}`).emit('product:updated', {
      productId,
      ...update,
      timestamp: new Date().toISOString(),
    });
  }

  // ==================== OFFER UPDATES ====================

  /**
   * Send offer notification to seller
   */
  sendOfferToSeller(sellerId: string, offer: any) {
    this.server.to(`user:${sellerId}`).emit('offer:received', offer);
  }

  /**
   * Send offer response to buyer
   */
  sendOfferResponse(buyerId: string, response: any) {
    this.server.to(`user:${buyerId}`).emit('offer:response', response);
  }

  // ==================== ADMIN EVENTS ====================

  @SubscribeMessage('admin:subscribe')
  handleAdminSubscribe(@ConnectedSocket() client: AuthenticatedSocket) {
    if (client.user?.role !== 'ADMIN') {
      return { event: 'error', data: { message: 'Unauthorized' } };
    }
    client.join('admin:dashboard');
    this.logger.log(`Admin ${client.userId} subscribed to dashboard updates`);
    return { event: 'admin:subscribed' };
  }

  /**
   * Send real-time stats to admin dashboard
   */
  sendAdminStats(stats: any) {
    this.server.to('admin:dashboard').emit('admin:stats', stats);
  }

  // ==================== GENERIC EMITTERS ====================

  emitToThread(threadId: string, event: string, payload: unknown): void {
    this.server.to(`thread:${threadId}`).emit(event, payload);
  }

  emitToUser(userId: string, event: string, payload: unknown): void {
    this.server.to(`user:${userId}`).emit(event, payload);
  }

  // ==================== UTILITY METHODS ====================

  /**
   * Check if user is online
   */
  isUserOnline(userId: string): boolean {
    return this.connectedUsers.has(userId);
  }

  /**
   * Get online users count
   */
  getOnlineUsersCount(): number {
    return this.connectedUsers.size;
  }

  /**
   * Get online user IDs
   */
  getOnlineUserIds(): string[] {
    return Array.from(this.connectedUsers.keys());
  }
}
