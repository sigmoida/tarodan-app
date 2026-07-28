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
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { Logger, UseGuards } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../prisma";
import { JwtPayload } from "../auth/interfaces";
import { SecurityService } from "../security/security.service";

interface AuthenticatedSocket extends Socket {
  userId?: string;
  authScope?: "user" | "admin";
  user?: {
    id: string;
    email: string;
    displayName: string;
    role?: string;
    isAdmin: boolean;
  };
}

@WebSocketGateway({
  cors: {
    origin: [
      "http://localhost:3000",
      "http://localhost:3002",
      "https://tarodan.com",
      "https://admin.tarodan.com",
    ],
    credentials: true,
  },
  namespace: "/",
  transports: ["websocket", "polling"],
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
    private readonly prisma: PrismaService,
    private readonly securityService: SecurityService,
  ) {}

  afterInit(server: Server) {
    this.logger.log("WebSocket Gateway initialized");
  }

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace("Bearer ", "");

      if (!token) {
        this.logger.warn(
          `Client ${client.id} connected without authentication`,
        );
        client.emit("error", { message: "Authentication required" });
        client.disconnect();
        return;
      }

      const { payload, authScope } = await this.verifySocketToken(token);
      if (payload.type !== "access") {
        throw new Error("Invalid token type");
      }

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          email: true,
          displayName: true,
          isBanned: true,
          deletedAt: true,
          adminUser: {
            select: {
              id: true,
              isActive: true,
              role: true,
            },
          },
        },
      });

      const isActiveAdmin = user?.adminUser?.isActive === true;
      const sessionAdminId =
        authScope === "admin" && payload.sessionToken
          ? await this.securityService.validateAdminSession(
              payload.sessionToken,
            )
          : null;
      if (
        !user ||
        user.deletedAt ||
        user.isBanned ||
        (authScope === "admin" &&
          (!payload.isAdmin ||
            !isActiveAdmin ||
            sessionAdminId !== user.adminUser?.id))
      ) {
        throw new Error("Inactive user");
      }

      client.userId = user.id;
      client.authScope = authScope;
      client.user = {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: isActiveAdmin ? user.adminUser?.role : undefined,
        isAdmin: isActiveAdmin,
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
      client.emit("connected", { userId: client.userId });
    } catch (error) {
      this.logger.error(
        `Authentication failed for client ${client.id}: ${error.message}`,
      );
      client.emit("error", { message: "Invalid authentication token" });
      client.disconnect();
    }
  }

  private async verifySocketToken(
    token: string,
  ): Promise<{ payload: JwtPayload; authScope: "user" | "admin" }> {
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.configService.getOrThrow<string>("JWT_SECRET"),
      });
      return { payload, authScope: "user" };
    } catch (userTokenError) {
      try {
        const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
          secret: this.configService.getOrThrow<string>("ADMIN_JWT_SECRET"),
        });
        return { payload, authScope: "admin" };
      } catch {
        throw userTokenError;
      }
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
      this.logger.log(
        `User ${client.userId} disconnected (socket: ${client.id})`,
      );
    }
  }

  // ==================== MESSAGING ====================

  @SubscribeMessage("join:thread")
  async handleJoinThread(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { threadId: string },
  ) {
    const thread = await this.prisma.messageThread.findUnique({
      where: { id: data.threadId },
    });

    const isParticipant =
      !!thread &&
      (client.userId === thread.participant1Id ||
        client.userId === thread.participant2Id);

    if (!isParticipant) {
      this.logger.warn(
        `User ${client.userId} denied join to thread ${data.threadId}`,
      );
      client.emit("error", { message: "Bu konuya erişim yetkiniz yok" });
      return { event: "error", data: { threadId: data.threadId } };
    }

    client.join(`thread:${data.threadId}`);
    this.logger.log(`User ${client.userId} joined thread ${data.threadId}`);
    return { event: "joined:thread", data: { threadId: data.threadId } };
  }

  @SubscribeMessage("leave:thread")
  handleLeaveThread(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { threadId: string },
  ) {
    client.leave(`thread:${data.threadId}`);
    this.logger.log(`User ${client.userId} left thread ${data.threadId}`);
    return { event: "left:thread", data: { threadId: data.threadId } };
  }

  @SubscribeMessage("typing:start")
  handleTypingStart(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { threadId: string },
  ) {
    if (!client.rooms.has(`thread:${data.threadId}`)) {
      return { event: "error", data: { threadId: data.threadId } };
    }
    client.to(`thread:${data.threadId}`).emit("typing:started", {
      threadId: data.threadId,
      userId: client.userId,
      displayName: client.user?.displayName,
    });
  }

  @SubscribeMessage("typing:stop")
  handleTypingStop(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { threadId: string },
  ) {
    if (!client.rooms.has(`thread:${data.threadId}`)) {
      return { event: "error", data: { threadId: data.threadId } };
    }
    client.to(`thread:${data.threadId}`).emit("typing:stopped", {
      threadId: data.threadId,
      userId: client.userId,
    });
  }

  // ==================== NOTIFICATIONS ====================

  /**
   * Send notification to specific user
   */
  sendNotificationToUser(userId: string, notification: any) {
    this.server.to(`user:${userId}`).emit("notification:new", notification);
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
    this.server.emit("notification:broadcast", notification);
    this.logger.debug("Broadcast notification sent");
  }

  // ==================== ORDER UPDATES ====================

  @SubscribeMessage("order:subscribe")
  async handleOrderSubscribe(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { orderId: string },
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: data.orderId },
      select: { buyerId: true, sellerId: true },
    });
    const isOrderParty =
      !!order &&
      (client.userId === order.buyerId || client.userId === order.sellerId);

    if (!isOrderParty) {
      this.logger.warn(
        `User ${client.userId} denied subscription to order ${data.orderId}`,
      );
      client.emit("error", { message: "Bu siparişe erişim yetkiniz yok" });
      return { event: "error", data: { orderId: data.orderId } };
    }

    client.join(`order:${data.orderId}`);
    this.logger.log(
      `User ${client.userId} subscribed to order ${data.orderId}`,
    );
    return { event: "order:subscribed", data: { orderId: data.orderId } };
  }

  /**
   * Send order status update
   */
  sendOrderUpdate(orderId: string, update: any) {
    this.server.to(`order:${orderId}`).emit("order:updated", {
      orderId,
      ...update,
      timestamp: new Date().toISOString(),
    });
  }

  // ==================== PRODUCT UPDATES ====================

  @SubscribeMessage("product:subscribe")
  handleProductSubscribe(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { productId: string },
  ) {
    client.join(`product:${data.productId}`);
    return { event: "product:subscribed", data: { productId: data.productId } };
  }

  /**
   * Send product update (price change, sold, etc.)
   */
  sendProductUpdate(productId: string, update: any) {
    this.server.to(`product:${productId}`).emit("product:updated", {
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
    this.server.to(`user:${sellerId}`).emit("offer:received", offer);
  }

  /**
   * Send offer response to buyer
   */
  sendOfferResponse(buyerId: string, response: any) {
    this.server.to(`user:${buyerId}`).emit("offer:response", response);
  }

  // ==================== ADMIN EVENTS ====================

  @SubscribeMessage("admin:subscribe")
  handleAdminSubscribe(@ConnectedSocket() client: AuthenticatedSocket) {
    if (client.authScope !== "admin" || !client.user?.isAdmin) {
      return { event: "error", data: { message: "Unauthorized" } };
    }
    client.join("admin:dashboard");
    this.logger.log(`Admin ${client.userId} subscribed to dashboard updates`);
    return { event: "admin:subscribed" };
  }

  /**
   * Send real-time stats to admin dashboard
   */
  sendAdminStats(stats: any) {
    this.server.to("admin:dashboard").emit("admin:stats", stats);
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
