import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { PrismaService } from "../../../prisma";
import { NotificationService } from "../../notification/notification.service";
import { NotificationType } from "../../notification/dto";
import { adminUrl } from "../../../config/app-urls";
import {
  PUBLIC_NAME_SELECT,
  publicName,
} from "../../../common/helpers/public-identity";
import {
  USER_BLOCKED_EVENT,
  UserBlockedPayload,
} from "../../user-block/user-block.constants";

/**
 * `user.blocked` olayını aktif admin'lere in-app bildirime çevirir (Apple App
 * Review: "notify the developer"). UserBlockModule Notification'a bağlanamaz
 * (Notification → WebSocket → UserBlock döngüsü); köprü burada, UserModule'de.
 */
@Injectable()
export class UserBlockAdminListener {
  private readonly logger = new Logger(UserBlockAdminListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
  ) {}

  @OnEvent(USER_BLOCKED_EVENT, { async: true })
  async handleUserBlocked(payload: UserBlockedPayload): Promise<void> {
    try {
      const [blocker, blocked] = await Promise.all([
        this.prisma.user.findUnique({
          where: { id: payload.blockerId },
          select: PUBLIC_NAME_SELECT,
        }),
        this.prisma.user.findUnique({
          where: { id: payload.blockedId },
          select: PUBLIC_NAME_SELECT,
        }),
      ]);
      await this.notifications.notifyAllAdmins(
        NotificationType.USER_BLOCKED_ADMIN,
        {
          blockId: payload.blockId,
          blockerId: payload.blockerId,
          blockedId: payload.blockedId,
          blockerName: publicName(blocker),
          blockedName: publicName(blocked),
          // Gerekçe cümlesi şablonda (ICU select) alıcının diline göre kurulur.
          reason: payload.reason ?? "",
          hasReason: payload.reason ? "yes" : "no",
          adminLink: `${adminUrl()}/accounts/users/${payload.blockedId}`,
        },
      );
    } catch (err: any) {
      this.logger.warn(
        `user.blocked admin notification failed (${payload.blockId}): ${err?.message ?? err}`,
      );
    }
  }
}
