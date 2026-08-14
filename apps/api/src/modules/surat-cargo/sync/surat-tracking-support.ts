import { Logger } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";

/**
 * Shared support helpers for the Sürat tracking sub-services (Faz 11.3a split).
 * These were previously private methods on the monolithic SuratTrackingService;
 * they are now module-scoped so multiple sub-services can reuse them without
 * duplication. Behaviour is byte-identical to the original.
 */

/** Lazy bildirim — NotificationService'i moduleRef ile çöz (circular import yok). */
export async function notifyUser(
  moduleRef: ModuleRef,
  logger: Logger,
  userId: string,
  typeName: "CARGO_CODE_READY" | "CARGO_MOVEMENT_MISSING",
  data: Record<string, any>,
): Promise<void> {
  try {
    const { NotificationService } =
      await import("../../notification/notification.service");
    const { NotificationType } = await import("../../notification/dto");
    const svc = moduleRef.get(NotificationService, { strict: false });
    await svc?.createInAppNotification(
      userId,
      NotificationType[typeName],
      data,
    );
  } catch (e: any) {
    logger.warn(`notify ${typeName} failed for user ${userId}: ${e?.message}`);
  }
}
